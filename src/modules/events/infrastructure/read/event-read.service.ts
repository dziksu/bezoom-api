import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, ne, type SQL } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import {
  events,
  locations,
  eventPhotos,
  eventLikes,
  eventSaves,
  eventParticipants,
  eventStats
} from '@api/shared/infrastructure/database/schema';
import type {
  EventResponseDto,
  EventDetailDto,
  EventPhotoResponseDto,
  AttendingEventDto
} from '../../application/dto/event-response.dto';

type EventRow = typeof events.$inferSelect;
type LocationRow = typeof locations.$inferSelect;

export interface Paginated<T> {
  items: T[];
  total: number;
}

/**
 * Read-side helper for event queries that don't need PostGIS distance
 * (geo search stays raw-SQL in its own handler). Uses the read connection
 * and the Drizzle query builder; batches photo fetches to avoid N+1.
 */
@Injectable()
export class EventReadService {
  constructor(
    private readonly readService: DrizzleReadService,
    private readonly objectStorage: ObjectStorageService
  ) {}

  private get db() {
    return this.readService.db;
  }

  async findDetailById(id: string): Promise<EventDetailDto | null> {
    const rows = await this.db
      .select({ event: events, location: locations, stats: eventStats })
      .from(events)
      .innerJoin(locations, eq(locations.eventId, events.id))
      .innerJoin(eventStats, eq(eventStats.eventId, events.id))
      .where(
        and(
          eq(events.id, id),
          eq(events.status, 'PUBLISHED'),
          eq(events.mediaPipelineStatus, 'READY'),
          eq(events.verificationStatus, 'VERIFIED'),
          eq(events.visibility, 'PUBLIC')
        )
      )
      .limit(1);

    if (rows.length === 0) return null;

    const photos = await this.fetchPhotos([id]);
    return {
      ...this.mapRow(rows[0].event, rows[0].location, photos.get(id) ?? []),
      likesCount: rows[0].stats.likesCount,
      savesCount: rows[0].stats.savesCount,
      attendingCount: rows[0].stats.attendingCount,
      commentsCount: rows[0].stats.commentsCount
    };
  }

  async listByOrganizer(sub: string, page: number, limit: number): Promise<Paginated<EventResponseDto>> {
    const where = eq(events.organizerKeycloakSub, sub);
    return this.listWithLocation(where, [desc(events.createdAt)], page, limit);
  }

  async listLiked(sub: string, page: number, limit: number): Promise<Paginated<EventResponseDto>> {
    const offset = (page - 1) * limit;

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({ event: events, location: locations })
        .from(eventLikes)
        .innerJoin(events, eq(events.id, eventLikes.eventId))
        .innerJoin(locations, eq(locations.eventId, events.id))
        .where(and(eq(eventLikes.keycloakSub, sub), this.publiclyAvailable()))
        .orderBy(desc(eventLikes.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(eventLikes)
        .innerJoin(events, eq(events.id, eventLikes.eventId))
        .where(and(eq(eventLikes.keycloakSub, sub), this.publiclyAvailable()))
    ]);

    return this.assembleList(rows, totalRow?.value ?? 0);
  }

  async listSaved(sub: string, page: number, limit: number): Promise<Paginated<EventResponseDto>> {
    const offset = (page - 1) * limit;

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({ event: events, location: locations })
        .from(eventSaves)
        .innerJoin(events, eq(events.id, eventSaves.eventId))
        .innerJoin(locations, eq(locations.eventId, events.id))
        .where(and(eq(eventSaves.keycloakSub, sub), this.publiclyAvailable()))
        .orderBy(desc(eventSaves.savedAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(eventSaves)
        .innerJoin(events, eq(events.id, eventSaves.eventId))
        .where(and(eq(eventSaves.keycloakSub, sub), this.publiclyAvailable()))
    ]);

    return this.assembleList(rows, totalRow?.value ?? 0);
  }

  async listAttending(sub: string, page: number, limit: number): Promise<Paginated<AttendingEventDto>> {
    const offset = (page - 1) * limit;

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({ event: events, location: locations, myRsvpStatus: eventParticipants.status })
        .from(eventParticipants)
        .innerJoin(events, eq(events.id, eventParticipants.eventId))
        .innerJoin(locations, eq(locations.eventId, events.id))
        .where(
          and(
            eq(eventParticipants.keycloakSub, sub),
            ne(eventParticipants.status, 'DECLINED'),
            this.publiclyAvailable()
          )
        )
        .orderBy(desc(events.startDate))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(eventParticipants)
        .innerJoin(events, eq(events.id, eventParticipants.eventId))
        .where(
          and(
            eq(eventParticipants.keycloakSub, sub),
            ne(eventParticipants.status, 'DECLINED'),
            this.publiclyAvailable()
          )
        )
    ]);

    const photos = await this.fetchPhotos(rows.map((r) => r.event.id));
    return {
      items: rows.map((r) => ({
        ...this.mapRow(r.event, r.location, photos.get(r.event.id) ?? []),
        myRsvpStatus: r.myRsvpStatus
      })),
      total: totalRow?.value ?? 0
    };
  }

  private async listWithLocation(
    where: SQL<unknown> | undefined,
    orderBy: Array<ReturnType<typeof desc>>,
    page: number,
    limit: number
  ): Promise<Paginated<EventResponseDto>> {
    const offset = (page - 1) * limit;

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({ event: events, location: locations })
        .from(events)
        .innerJoin(locations, eq(locations.eventId, events.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ value: count() }).from(events).where(where)
    ]);

    return this.assembleList(rows, totalRow?.value ?? 0);
  }

  private async assembleList(
    rows: Array<{ event: EventRow; location: LocationRow }>,
    total: number
  ): Promise<Paginated<EventResponseDto>> {
    const photos = await this.fetchPhotos(rows.map((r) => r.event.id));
    return {
      items: rows.map((r) => this.mapRow(r.event, r.location, photos.get(r.event.id) ?? [])),
      total
    };
  }

  private async fetchPhotos(eventIds: string[]): Promise<Map<string, EventPhotoResponseDto[]>> {
    const map = new Map<string, EventPhotoResponseDto[]>();
    if (eventIds.length === 0) return map;

    const rows = await this.db
      .select({
        eventId: eventPhotos.eventId,
        id: eventPhotos.id,
        mediaKey: eventPhotos.mediaKey,
        position: eventPhotos.position
      })
      .from(eventPhotos)
      .where(and(inArray(eventPhotos.eventId, eventIds), eq(eventPhotos.status, 'READY')))
      .orderBy(eventPhotos.eventId, eventPhotos.position);

    for (const row of rows) {
      if (!row.eventId || !row.mediaKey) continue;
      const list = map.get(row.eventId) ?? [];
      list.push({
        id: row.id,
        url: this.objectStorage.getPublicUrl(this.objectStorage.mediaBucket, row.mediaKey),
        position: row.position ?? 0
      });
      map.set(row.eventId, list);
    }

    return map;
  }

  private publiclyAvailable(): SQL<unknown> | undefined {
    return and(
      eq(events.status, 'PUBLISHED'),
      eq(events.mediaPipelineStatus, 'READY'),
      eq(events.verificationStatus, 'VERIFIED'),
      eq(events.visibility, 'PUBLIC')
    );
  }

  private mapRow(event: EventRow, location: LocationRow, photos: EventPhotoResponseDto[]): EventResponseDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      category: event.category,
      startDate: event.startDate,
      endDate: event.endDate ?? undefined,
      organizerKeycloakSub: event.organizerKeycloakSub,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      address: location.address ?? undefined,
      city: location.city ?? undefined,
      country: location.country ?? 'PL',
      priceType: event.priceType ?? 'FREE',
      priceMin: event.priceMin != null ? Number(event.priceMin) : undefined,
      priceMax: event.priceMax != null ? Number(event.priceMax) : undefined,
      currency: event.currency ?? 'PLN',
      ticketUrl: event.ticketUrl ?? undefined,
      priceNotes: event.priceNotes ?? undefined,
      amenities: event.amenities ?? [],
      photos,
      status: event.status,
      visibility: event.visibility,
      verificationStatus: event.verificationStatus,
      verificationRejectionReason: event.verificationRejectionReason ?? undefined,
      createdAt: event.createdAt
    };
  }
}
