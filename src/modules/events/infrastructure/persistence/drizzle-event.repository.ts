import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { events, locations, eventPhotos, eventStats, eventOutbox } from '@api/shared/infrastructure/database/schema';
import { Event } from '../../domain/event.aggregate';
import { EventRepository, type NewPendingPhoto, type PendingPhoto } from '../../domain/event.repository';
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
