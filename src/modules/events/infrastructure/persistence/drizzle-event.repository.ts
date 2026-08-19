import { ConflictException, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { events, locations, eventPhotos, eventStats, eventOutbox } from '@api/shared/infrastructure/database/schema';
import { Event } from '../../domain/event.aggregate';
import {
  EventRepository,
  type NewPendingPhoto,
  type PendingPhoto,
  type PersistEventChangesOptions,
  type RevisablePhoto
} from '../../domain/event.repository';
import { EventMapper } from './event.mapper';

@Injectable()
export class DrizzleEventRepository extends EventRepository {
  constructor(private readonly writeService: DrizzleWriteService) {
    super();
  }

  async save(event: Event): Promise<void> {
    const db = this.writeService.db;

    await db.transaction(async (tx) => {
      await tx.insert(events).values(EventMapper.toEventRow(event));
      await tx.insert(locations).values(EventMapper.toLocationRow(event));
      await tx.insert(eventStats).values({ eventId: event.id });

      for (const photo of EventMapper.toPhotoUpdateRows(event)) {
        const { id, ...update } = photo;
        await tx.update(eventPhotos).set(update).where(eq(eventPhotos.id, id));
      }

      await tx.insert(eventOutbox).values({
        aggregateId: event.id,
        eventType: 'event.created',
        payload: { eventId: event.id, organizerKeycloakSub: event.organizerKeycloakSub }
      });
    });
  }

  async findById(id: string): Promise<Event | null> {
    const [row] = await this.writeService.db
      .select({ event: events, location: locations })
      .from(events)
      .innerJoin(locations, eq(locations.eventId, events.id))
      .where(eq(events.id, id))
      .limit(1);

    if (!row) return null;

    const photos = await this.writeService.db
      .select()
      .from(eventPhotos)
      .where(eq(eventPhotos.eventId, id))
      .orderBy(asc(eventPhotos.position));

    return EventMapper.toDomain(row.event, row.location, photos);
  }

  async updateLifecycle(event: Event): Promise<void> {
    await this.writeService.db.transaction(async (tx) => {
      const updated = await tx
        .update(events)
        .set({
          status: event.status,
          mediaPipelineStatus: event.mediaPipelineStatus,
          verificationStatus: event.verificationStatus,
          verificationRejectionReason: event.verificationRejectionReason ?? null,
          verifiedAt: event.verifiedAt ?? null,
          archivedAt: event.archivedAt ?? null,
          version: sql`${events.version} + 1`,
          updatedAt: event.updatedAt
        })
        .where(and(eq(events.id, event.id), eq(events.version, event.version)))
        .returning({ id: events.id });

      if (updated.length === 0) throw new ConflictException('EVENT_CONCURRENT_MODIFICATION');

      for (const photo of EventMapper.toPhotoUpdateRows(event)) {
        const { id: photoId, ...update } = photo;
        await tx
          .update(eventPhotos)
          .set(update)
          .where(and(eq(eventPhotos.id, photoId), eq(eventPhotos.eventId, event.id)));
      }
    });
  }

  async update(event: Event, options: PersistEventChangesOptions = {}): Promise<void> {
    await this.writeService.db.transaction(async (tx) => {
      const updated = await tx
        .update(events)
        .set({
          title: event.title,
          submittedByIsOrganizer: event.submittedByIsOrganizer,
          description: event.description,
          category: event.category,
          startDate: event.period.startDate,
          endDate: event.period.endDate ?? null,
          priceType: event.price.priceType,
          priceMin: event.price.priceMin?.toString() ?? null,
          priceMax: event.price.priceMax?.toString() ?? null,
          currency: event.price.currency,
          ticketUrl: event.price.ticketUrl ?? null,
          priceNotes: event.price.priceNotes ?? null,
          amenities: event.amenities,
          status: event.status,
          mediaPipelineStatus: event.mediaPipelineStatus,
          visibility: event.visibility,
          verificationStatus: event.verificationStatus,
          verificationRejectionReason: event.verificationRejectionReason ?? null,
          verifiedAt: event.verifiedAt ?? null,
          archivedAt: event.archivedAt ?? null,
          version: sql`${events.version} + 1`,
          updatedAt: event.updatedAt
        })
        .where(and(eq(events.id, event.id), eq(events.version, event.version)))
        .returning({ id: events.id });

      if (updated.length === 0) throw new ConflictException('EVENT_CONCURRENT_MODIFICATION');

      await tx
        .update(locations)
        .set({
          latitude: event.location.coordinates.latitude.toString(),
          longitude: event.location.coordinates.longitude.toString(),
          address: event.location.address ?? null,
          city: event.location.city ?? null,
          country: event.location.country
        })
        .where(eq(locations.eventId, event.id));

      if (options.removedPhotoIds?.length) {
        await tx
          .delete(eventPhotos)
          .where(and(eq(eventPhotos.eventId, event.id), inArray(eventPhotos.id, options.removedPhotoIds)));
      }

      for (const photo of EventMapper.toPhotoUpdateRows(event)) {
        const { id: photoId, ...photoUpdate } = photo;
        const linked = await tx
          .update(eventPhotos)
          .set({ ...photoUpdate, updatedAt: new Date() })
          .where(
            and(
              eq(eventPhotos.id, photoId),
              eq(eventPhotos.ownerKeycloakSub, event.organizerKeycloakSub),
              sql`(${eventPhotos.eventId} IS NULL OR ${eventPhotos.eventId} = ${event.id})`
            )
          )
          .returning({ id: eventPhotos.id });

        if (linked.length === 0) throw new ConflictException('EVENT_PHOTO_STATE_CHANGED');
      }

      if (options.enqueueReview) {
        await tx.insert(eventOutbox).values({
          aggregateId: event.id,
          eventType: 'event.review.requested',
          payload: { eventId: event.id }
        });
      }
    });
  }

  async findPendingPhotosByIds(ids: string[], ownerSub: string): Promise<PendingPhoto[]> {
    if (ids.length === 0) return [];

    const rows = await this.writeService.db
      .select({
        id: eventPhotos.id,
        ownerKeycloakSub: eventPhotos.ownerKeycloakSub,
        rawKey: eventPhotos.rawKey,
        mimeType: eventPhotos.mimeType
      })
      .from(eventPhotos)
      .where(
        and(
          inArray(eventPhotos.id, ids),
          eq(eventPhotos.ownerKeycloakSub, ownerSub),
          isNull(eventPhotos.eventId),
          eq(eventPhotos.status, 'PENDING_UPLOAD')
        )
      );

    return rows;
  }

  async findPhotosForRevision(ids: string[], ownerSub: string, eventId: string): Promise<RevisablePhoto[]> {
    if (ids.length === 0) return [];

    return this.writeService.db
      .select({
        id: eventPhotos.id,
        ownerKeycloakSub: eventPhotos.ownerKeycloakSub,
        rawKey: eventPhotos.rawKey,
        mimeType: eventPhotos.mimeType,
        eventId: eventPhotos.eventId,
        mediaKey: eventPhotos.mediaKey,
        status: eventPhotos.status,
        sizeBytes: eventPhotos.sizeBytes
      })
      .from(eventPhotos)
      .where(
        and(
          inArray(eventPhotos.id, ids),
          eq(eventPhotos.ownerKeycloakSub, ownerSub),
          sql`(${eventPhotos.eventId} IS NULL OR ${eventPhotos.eventId} = ${eventId})`
        )
      );
  }

  async createPendingPhotos(photos: NewPendingPhoto[]): Promise<void> {
    if (photos.length === 0) return;

    await this.writeService.db.insert(eventPhotos).values(
      photos.map((p) => ({
        id: p.id,
        ownerKeycloakSub: p.ownerKeycloakSub,
        rawKey: p.rawKey,
        mimeType: p.mimeType,
        status: 'PENDING_UPLOAD' as const
      }))
    );
  }
}
