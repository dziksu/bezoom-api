import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import {
  events,
  eventLikes,
  eventSaves,
  eventParticipants,
  eventOutbox,
  eventStats
} from '@api/shared/infrastructure/database/schema';
import {
  EventEngagementRepository,
  type EventVisibilitySnapshot
} from '../../domain/engagement/event-engagement.repository';
import type { RsvpStatus } from '../../domain/engagement/rsvp-status';

@Injectable()
export class DrizzleEventEngagementRepository extends EventEngagementRepository {
  constructor(private readonly writeService: DrizzleWriteService) {
    super();
  }

  private get db() {
    return this.writeService.db;
  }

  async findEventForEngagement(eventId: string): Promise<EventVisibilitySnapshot | null> {
    const rows = await this.db
      .select({
        id: events.id,
        status: events.status,
        visibility: events.visibility,
        verificationStatus: events.verificationStatus,
        mediaPipelineStatus: events.mediaPipelineStatus
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    return rows[0] ?? null;
  }

  async setLike(eventId: string, keycloakSub: string, liked: boolean): Promise<void> {
    await this.db.transaction(async (tx) => {
      const changed = liked
        ? await tx
            .insert(eventLikes)
            .values({ eventId, keycloakSub })
            .onConflictDoNothing()
            .returning({ id: eventLikes.id })
        : await tx
            .delete(eventLikes)
            .where(and(eq(eventLikes.eventId, eventId), eq(eventLikes.keycloakSub, keycloakSub)))
            .returning({ id: eventLikes.id });

      if (changed.length > 0) {
        await tx.insert(eventOutbox).values({
          aggregateId: eventId,
          eventType: 'event.stats.changed',
          payload: { likesDelta: liked ? 1 : -1, savesDelta: 0, attendingDelta: 0, commentsDelta: 0 }
        });
      }
    });
  }

  async setSave(eventId: string, keycloakSub: string, saved: boolean): Promise<void> {
    await this.db.transaction(async (tx) => {
      const changed = saved
        ? await tx
            .insert(eventSaves)
            .values({ eventId, keycloakSub })
            .onConflictDoNothing()
            .returning({ id: eventSaves.id })
        : await tx
            .delete(eventSaves)
            .where(and(eq(eventSaves.eventId, eventId), eq(eventSaves.keycloakSub, keycloakSub)))
            .returning({ id: eventSaves.id });

      if (changed.length > 0) {
        await tx.insert(eventOutbox).values({
          aggregateId: eventId,
          eventType: 'event.stats.changed',
          payload: { likesDelta: 0, savesDelta: saved ? 1 : -1, attendingDelta: 0, commentsDelta: 0 }
        });
      }
    });
  }

  async setRsvp(eventId: string, keycloakSub: string, status: RsvpStatus): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(eventParticipants)
        .values({ eventId, keycloakSub, status })
        .onConflictDoNothing()
        .returning({ id: eventParticipants.id });

      let attendingDelta = status === 'CONFIRMED' ? 1 : 0;
      let changed = inserted.length > 0;

      if (!changed) {
        const [current] = await tx
          .select({ status: eventParticipants.status })
          .from(eventParticipants)
          .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.keycloakSub, keycloakSub)))
          .for('update')
          .limit(1);

        if (current && current.status !== status) {
          attendingDelta = Number(status === 'CONFIRMED') - Number(current.status === 'CONFIRMED');
          await tx
            .update(eventParticipants)
            .set({ status })
            .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.keycloakSub, keycloakSub)));
          changed = true;
        }
      }

      if (changed) {
        await tx.insert(eventOutbox).values({
          aggregateId: eventId,
          eventType: 'event.stats.changed',
          payload: { likesDelta: 0, savesDelta: 0, attendingDelta, commentsDelta: 0 }
        });
      }
    });
  }

  async cancelRsvp(eventId: string, keycloakSub: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(eventParticipants)
        .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.keycloakSub, keycloakSub)))
        .returning({ status: eventParticipants.status });

      if (deleted.length > 0) {
        await tx.insert(eventOutbox).values({
          aggregateId: eventId,
          eventType: 'event.stats.changed',
          payload: {
            likesDelta: 0,
            savesDelta: 0,
            attendingDelta: deleted[0].status === 'CONFIRMED' ? -1 : 0,
            commentsDelta: 0
          }
        });
      }
    });
  }

  async getStats(eventId: string) {
    const [row] = await this.db
      .select({
        likesCount: eventStats.likesCount,
        savesCount: eventStats.savesCount,
        attendingCount: eventStats.attendingCount,
        commentsCount: eventStats.commentsCount
      })
      .from(eventStats)
      .where(eq(eventStats.eventId, eventId))
      .limit(1);

    return row ?? { likesCount: 0, savesCount: 0, attendingCount: 0, commentsCount: 0 };
  }
}
