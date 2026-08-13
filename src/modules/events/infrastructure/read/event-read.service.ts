import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { decodeTimestampCursor, encodeTimestampCursor } from '@api/shared/domain/cursor-pagination';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import {
  events,
  locations,
  eventPhotos,
  eventLikes,
  eventSaves,
  eventParticipants,
  eventStats,
  profiles,
  userBlocks
} from '@api/shared/infrastructure/database/schema';
import type {
  EventResponseDto,
  EventDetailDto,
  EventPhotoResponseDto,
  AttendingEventDto
} from '../../application/dto/event-response.dto';

type EventRow = typeof events.$inferSelect;
type LocationRow = typeof locations.$inferSelect;

export interface CursorPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
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

  async findDetailById(id: string, viewerKeycloakSub?: string): Promise<EventDetailDto | null> {
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
          eq(events.visibility, 'PUBLIC'),
          isNull(events.archivedAt),
          viewerKeycloakSub
            ? sql`NOT EXISTS (
                SELECT 1 FROM ${userBlocks} block
                WHERE (block.blocker_keycloak_sub = ${viewerKeycloakSub} AND block.blocked_keycloak_sub = ${events.organizerKeycloakSub})
                   OR (block.blocked_keycloak_sub = ${viewerKeycloakSub} AND block.blocker_keycloak_sub = ${events.organizerKeycloakSub})
              )`
            : undefined
        )
      )
      .limit(1);

    if (rows.length === 0) return null;

    const photos = await this.fetchPhotos([id]);
    const organizerIds = await this.fetchOrganizerIds([rows[0].event.organizerKeycloakSub]);
    return {
      ...this.mapRow(
        rows[0].event,
        rows[0].location,
        photos.get(id) ?? [],
        organizerIds.get(rows[0].event.organizerKeycloakSub)
      ),
      likesCount: rows[0].stats.likesCount,
      savesCount: rows[0].stats.savesCount,
      attendingCount: rows[0].stats.attendingCount,
      commentsCount: rows[0].stats.commentsCount
    };
  }

  async listByOrganizer(
    sub: string,
    cursorValue: string | undefined,
    limit: number
  ): Promise<CursorPage<EventResponseDto>> {
    const cursor = decodeTimestampCursor(cursorValue, 'my_created_events');
    const rows = await this.db
      .select({
        event: events,
        location: locations,
        cursorAt: events.createdAt,
        cursorId: events.id
      })
      .from(events)
      .innerJoin(locations, eq(locations.eventId, events.id))
      .where(
        and(
          eq(events.organizerKeycloakSub, sub),
          isNull(events.archivedAt),
          cursor
            ? or(
                lt(events.createdAt, cursor.timestamp),
                and(eq(events.createdAt, cursor.timestamp), lt(events.id, cursor.id))
              )
            : undefined
        )
      )
      .orderBy(desc(events.createdAt), desc(events.id))
      .limit(limit + 1);

    return this.assembleCursorPage(rows, limit, 'my_created_events');
  }

  async listLiked(sub: string, cursorValue: string | undefined, limit: number): Promise<CursorPage<EventResponseDto>> {
    const cursor = decodeTimestampCursor(cursorValue, 'my_liked_events');
    const rows = await this.db
      .select({
        event: events,
        location: locations,
        cursorAt: eventLikes.createdAt,
        cursorId: eventLikes.id
      })
      .from(eventLikes)
      .innerJoin(events, eq(events.id, eventLikes.eventId))
      .innerJoin(locations, eq(locations.eventId, events.id))
      .where(
        and(
          eq(eventLikes.keycloakSub, sub),
          this.publiclyAvailable(),
          this.notBlocked(sub),
          cursor
            ? or(
                lt(eventLikes.createdAt, cursor.timestamp),
                and(eq(eventLikes.createdAt, cursor.timestamp), lt(eventLikes.id, cursor.id))
              )
            : undefined
        )
      )
      .orderBy(desc(eventLikes.createdAt), desc(eventLikes.id))
      .limit(limit + 1);

    return this.assembleCursorPage(rows, limit, 'my_liked_events');
  }

  async listSaved(sub: string, cursorValue: string | undefined, limit: number): Promise<CursorPage<EventResponseDto>> {
    const cursor = decodeTimestampCursor(cursorValue, 'my_saved_events');
    const rows = await this.db
      .select({
        event: events,
        location: locations,
        cursorAt: eventSaves.savedAt,
        cursorId: eventSaves.id
      })
      .from(eventSaves)
      .innerJoin(events, eq(events.id, eventSaves.eventId))
      .innerJoin(locations, eq(locations.eventId, events.id))
      .where(
        and(
          eq(eventSaves.keycloakSub, sub),
          this.publiclyAvailable(),
          this.notBlocked(sub),
          cursor
            ? or(
                lt(eventSaves.savedAt, cursor.timestamp),
                and(eq(eventSaves.savedAt, cursor.timestamp), lt(eventSaves.id, cursor.id))
              )
            : undefined
        )
      )
      .orderBy(desc(eventSaves.savedAt), desc(eventSaves.id))
      .limit(limit + 1);

    return this.assembleCursorPage(rows, limit, 'my_saved_events');
  }

  async listAttending(
    sub: string,
    cursorValue: string | undefined,
    limit: number
  ): Promise<CursorPage<AttendingEventDto>> {
    const cursor = decodeTimestampCursor(cursorValue, 'my_attending_events');
    const rows = await this.db
      .select({
        event: events,
        location: locations,
        myRsvpStatus: eventParticipants.status,
        cursorAt: eventParticipants.joinedAt,
        cursorId: eventParticipants.id
      })
      .from(eventParticipants)
      .innerJoin(events, eq(events.id, eventParticipants.eventId))
      .innerJoin(locations, eq(locations.eventId, events.id))
      .where(
        and(
          eq(eventParticipants.keycloakSub, sub),
          ne(eventParticipants.status, 'DECLINED'),
          this.publiclyAvailable(),
          this.notBlocked(sub),
          cursor
            ? or(
                lt(eventParticipants.joinedAt, cursor.timestamp),
                and(eq(eventParticipants.joinedAt, cursor.timestamp), lt(eventParticipants.id, cursor.id))
              )
            : undefined
        )
      )
      .orderBy(desc(eventParticipants.joinedAt), desc(eventParticipants.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const photos = await this.fetchPhotos(pageRows.map((r) => r.event.id));
    const organizerIds = await this.fetchOrganizerIds(pageRows.map((r) => r.event.organizerKeycloakSub));
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((r) => ({
        ...this.mapRow(
          r.event,
          r.location,
          photos.get(r.event.id) ?? [],
          organizerIds.get(r.event.organizerKeycloakSub)
        ),
        myRsvpStatus: r.myRsvpStatus
      })),
      hasMore,
      nextCursor:
        hasMore && last ? encodeTimestampCursor('my_attending_events', last.cursorAt, last.cursorId) : undefined
    };
  }

  private async assembleCursorPage(
    rows: Array<{
      event: EventRow;
      location: LocationRow;
      cursorAt: Date;
      cursorId: string;
    }>,
    limit: number,
    cursorKind: string
  ): Promise<CursorPage<EventResponseDto>> {
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const photos = await this.fetchPhotos(pageRows.map((r) => r.event.id));
    const organizerIds = await this.fetchOrganizerIds(pageRows.map((r) => r.event.organizerKeycloakSub));
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((r) =>
        this.mapRow(r.event, r.location, photos.get(r.event.id) ?? [], organizerIds.get(r.event.organizerKeycloakSub))
      ),
      hasMore,
      nextCursor: hasMore && last ? encodeTimestampCursor(cursorKind, last.cursorAt, last.cursorId) : undefined
    };
  }

  private async fetchOrganizerIds(subs: string[]): Promise<Map<string, string>> {
    const uniqueSubs = [...new Set(subs)];
    if (uniqueSubs.length === 0) return new Map();

    const rows = await this.db
      .select({ keycloakSub: profiles.keycloakSub, id: profiles.id })
      .from(profiles)
      .where(inArray(profiles.keycloakSub, uniqueSubs));

    return new Map(rows.map((row) => [row.keycloakSub, row.id]));
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
      eq(events.visibility, 'PUBLIC'),
      isNull(events.archivedAt)
    );
  }

  private notBlocked(viewerKeycloakSub: string): SQL {
    return sql`NOT EXISTS (
      SELECT 1 FROM ${userBlocks} ub
      WHERE (ub.blocker_keycloak_sub = ${viewerKeycloakSub} AND ub.blocked_keycloak_sub = ${events.organizerKeycloakSub})
         OR (ub.blocked_keycloak_sub = ${viewerKeycloakSub} AND ub.blocker_keycloak_sub = ${events.organizerKeycloakSub})
    )`;
  }

  private mapRow(
    event: EventRow,
    location: LocationRow,
    photos: EventPhotoResponseDto[],
    organizerId?: string
  ): EventResponseDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      category: event.category,
      startDate: event.startDate,
      endDate: event.endDate ?? undefined,
      organizerId,
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
      verificationStatus: event.verificationStatus,
      verificationRejectionReason: event.verificationRejectionReason ?? undefined,
      createdAt: event.createdAt
    };
  }
}
