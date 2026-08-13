import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { eventComments, eventOutbox, profiles } from '@api/shared/infrastructure/database/schema';
import {
  EventCommentRepository,
  type EventCommentRecord,
  type PublicEventActor
} from '../../domain/comments/event-comment.repository';

@Injectable()
export class DrizzleEventCommentRepository extends EventCommentRepository {
  constructor(private readonly writeService: DrizzleWriteService) {
    super();
  }

  async create(
    eventId: string,
    authorKeycloakSub: string,
    body: string,
    parentId?: string
  ): Promise<EventCommentRecord> {
    return this.writeService.db.transaction(async (tx) => {
      const [author] = await tx
        .select({
          id: profiles.id,
          username: profiles.username,
          firstName: profiles.firstName,
          lastName: profiles.lastName,
          avatarUrl: profiles.avatarUrl
        })
        .from(profiles)
        .where(and(eq(profiles.keycloakSub, authorKeycloakSub), eq(profiles.isDeactivated, false)))
        .limit(1);
      if (!author) throw new BadRequestException('PROFILE_NOT_FOUND');

      if (parentId) {
        const [parent] = await tx
          .select({ id: eventComments.id })
          .from(eventComments)
          .where(
            and(
              eq(eventComments.id, parentId),
              eq(eventComments.eventId, eventId),
              isNull(eventComments.parentId),
              isNull(eventComments.deletedAt)
            )
          )
          .for('update')
          .limit(1);
        if (!parent) throw new BadRequestException('COMMENT_PARENT_INVALID');
      }

      const [created] = await tx
        .insert(eventComments)
        .values({ eventId, authorKeycloakSub, parentId, body })
        .returning();
      await tx.insert(eventOutbox).values({
        aggregateId: eventId,
        eventType: 'event.stats.changed',
        payload: { likesDelta: 0, savesDelta: 0, attendingDelta: 0, commentsDelta: 1 }
      });

      return this.map(created, author);
    });
  }

  async updateOwned(
    eventId: string,
    commentId: string,
    authorKeycloakSub: string,
    body: string
  ): Promise<EventCommentRecord | null> {
    const now = new Date();
    const [updated] = await this.writeService.db
      .update(eventComments)
      .set({ body, editedAt: now, updatedAt: now })
      .where(
        and(
          eq(eventComments.id, commentId),
          eq(eventComments.eventId, eventId),
          eq(eventComments.authorKeycloakSub, authorKeycloakSub),
          isNull(eventComments.deletedAt)
        )
      )
      .returning();
    if (!updated) return null;

    const [author] = await this.writeService.db
      .select({
        id: profiles.id,
        username: profiles.username,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        avatarUrl: profiles.avatarUrl
      })
      .from(profiles)
      .where(eq(profiles.keycloakSub, authorKeycloakSub))
      .limit(1);
    if (!author) return null;
    return this.map(updated, author);
  }

  async deleteOwned(eventId: string, commentId: string, authorKeycloakSub: string): Promise<boolean> {
    return this.writeService.db.transaction(async (tx) => {
      const now = new Date();
      const deleted = await tx
        .update(eventComments)
        .set({ body: '', deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(eventComments.id, commentId),
            eq(eventComments.eventId, eventId),
            eq(eventComments.authorKeycloakSub, authorKeycloakSub),
            isNull(eventComments.deletedAt)
          )
        )
        .returning({ id: eventComments.id });
      if (deleted.length === 0) return false;

      await tx.insert(eventOutbox).values({
        aggregateId: eventId,
        eventType: 'event.stats.changed',
        payload: { likesDelta: 0, savesDelta: 0, attendingDelta: 0, commentsDelta: -1 }
      });
      return true;
    });
  }

  private map(
    comment: typeof eventComments.$inferSelect,
    author: {
      id: string;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
    }
  ): EventCommentRecord {
    return {
      id: comment.id,
      eventId: comment.eventId,
      parentId: comment.parentId ?? undefined,
      body: comment.body,
      author: this.actor(author),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      editedAt: comment.editedAt ?? undefined
    };
  }

  private actor(profile: {
    id: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  }): PublicEventActor {
    return {
      id: profile.id,
      username: profile.username ?? undefined,
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      avatarUrl: profile.avatarUrl ?? undefined
    };
  }
}
