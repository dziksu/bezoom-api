import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, exists, inArray, isNull, ne, sql } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import {
  eventCommentLikes,
  eventCommentMentions,
  eventComments,
  eventOutbox,
  events,
  profiles,
  userBlocks
} from '@api/shared/infrastructure/database/schema';
import {
  EventCommentRepository,
  type EventCommentEngagementTarget,
  type EventCommentLikeRecord,
  type EventCommentRecord,
  type PublicEventActor
} from '../../domain/comments/event-comment.repository';

const MAX_MENTIONS = 10;

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

      const [event] = await tx
        .select({
          organizerKeycloakSub: events.organizerKeycloakSub,
          submittedByIsOrganizer: events.submittedByIsOrganizer
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);
      if (!event) throw new BadRequestException('EVENT_NOT_FOUND');

      let parentAuthorKeycloakSub: string | undefined;
      if (parentId) {
        const [parent] = await tx
          .select({ id: eventComments.id, authorKeycloakSub: eventComments.authorKeycloakSub })
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
        parentAuthorKeycloakSub = parent.authorKeycloakSub;
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

      const mentions = await this.replaceMentions(
        tx,
        created.id,
        eventId,
        authorKeycloakSub,
        body,
        new Set(),
        parentAuthorKeycloakSub
      );
      if (parentAuthorKeycloakSub && parentAuthorKeycloakSub !== authorKeycloakSub) {
        await tx.insert(eventOutbox).values({
          aggregateId: eventId,
          eventType: 'comment.replied',
          payload: {
            commentId: created.id,
            parentCommentId: parentId,
            actorKeycloakSub: authorKeycloakSub,
            recipientKeycloakSub: parentAuthorKeycloakSub
          }
        });
      }

      return this.map(created, author, event, mentions);
    });
  }

  async updateOwned(
    eventId: string,
    commentId: string,
    authorKeycloakSub: string,
    body: string
  ): Promise<EventCommentRecord | null> {
    return this.writeService.db.transaction(async (tx) => {
      const now = new Date();
      const [updated] = await tx
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

      const [author] = await tx
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
      const [event] = await tx
        .select({
          organizerKeycloakSub: events.organizerKeycloakSub,
          submittedByIsOrganizer: events.submittedByIsOrganizer
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);
      if (!author || !event) return null;

      const existing = await tx
        .select({ keycloakSub: eventCommentMentions.mentionedKeycloakSub })
        .from(eventCommentMentions)
        .where(eq(eventCommentMentions.commentId, commentId));
      const mentions = await this.replaceMentions(
        tx,
        commentId,
        eventId,
        authorKeycloakSub,
        body,
        new Set(existing.map((item) => item.keycloakSub))
      );
      return this.map(updated, author, event, mentions);
    });
  }

  async findEngagementTarget(eventId: string, commentId: string): Promise<EventCommentEngagementTarget | null> {
    const [target] = await this.writeService.db
      .select({ authorKeycloakSub: eventComments.authorKeycloakSub })
      .from(eventComments)
      .where(and(eq(eventComments.id, commentId), eq(eventComments.eventId, eventId), isNull(eventComments.deletedAt)))
      .limit(1);
    return target ?? null;
  }

  async setLike(
    eventId: string,
    commentId: string,
    actorKeycloakSub: string,
    liked: boolean
  ): Promise<EventCommentLikeRecord | null> {
    return this.writeService.db.transaction(async (tx) => {
      const [comment] = await tx
        .select({
          id: eventComments.id,
          authorKeycloakSub: eventComments.authorKeycloakSub,
          likesCount: eventComments.likesCount,
          organizerKeycloakSub: events.organizerKeycloakSub
        })
        .from(eventComments)
        .innerJoin(events, eq(events.id, eventComments.eventId))
        .where(
          and(eq(eventComments.id, commentId), eq(eventComments.eventId, eventId), isNull(eventComments.deletedAt))
        )
        .for('update')
        .limit(1);
      if (!comment) return null;

      let changed = false;
      let likesCount = comment.likesCount;
      if (liked) {
        const inserted = await tx
          .insert(eventCommentLikes)
          .values({ commentId, keycloakSub: actorKeycloakSub })
          .onConflictDoNothing()
          .returning({ id: eventCommentLikes.id });
        changed = inserted.length > 0;
        if (changed) likesCount += 1;
      } else {
        const deleted = await tx
          .delete(eventCommentLikes)
          .where(and(eq(eventCommentLikes.commentId, commentId), eq(eventCommentLikes.keycloakSub, actorKeycloakSub)))
          .returning({ id: eventCommentLikes.id });
        changed = deleted.length > 0;
        if (changed) likesCount = Math.max(0, likesCount - 1);
      }

      if (changed) {
        await tx
          .update(eventComments)
          .set({ likesCount, updatedAt: new Date() })
          .where(eq(eventComments.id, commentId));
      }
      if (liked && changed && actorKeycloakSub !== comment.authorKeycloakSub) {
        await tx.insert(eventOutbox).values({
          aggregateId: eventId,
          eventType: 'comment.liked',
          payload: {
            commentId,
            actorKeycloakSub,
            recipientKeycloakSub: comment.authorKeycloakSub
          }
        });
      }

      const [organizerLike] = await tx
        .select({
          id: profiles.id,
          username: profiles.username,
          firstName: profiles.firstName,
          lastName: profiles.lastName,
          avatarUrl: profiles.avatarUrl
        })
        .from(eventCommentLikes)
        .innerJoin(profiles, eq(profiles.keycloakSub, eventCommentLikes.keycloakSub))
        .where(
          and(
            eq(eventCommentLikes.commentId, commentId),
            eq(eventCommentLikes.keycloakSub, comment.organizerKeycloakSub),
            eq(profiles.isDeactivated, false)
          )
        )
        .limit(1);

      return {
        liked,
        likesCount,
        organizerLike: organizerLike ? this.actor(organizerLike) : undefined
      };
    });
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
    },
    event: { organizerKeycloakSub: string; submittedByIsOrganizer: boolean },
    mentions: PublicEventActor[] = []
  ): EventCommentRecord {
    return {
      id: comment.id,
      eventId: comment.eventId,
      parentId: comment.parentId ?? undefined,
      body: comment.body,
      author: this.actor(author),
      authorRole:
        comment.authorKeycloakSub === event.organizerKeycloakSub
          ? event.submittedByIsOrganizer
            ? 'ORGANIZER'
            : 'SUBMITTER'
          : undefined,
      mentions,
      likesCount: comment.likesCount,
      likedByViewer: false,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      editedAt: comment.editedAt ?? undefined
    };
  }

  private extractMentionUsernames(body: string): string[] {
    const usernames = new Set<string>();
    for (const match of body.matchAll(/(^|[^a-z0-9_-])@([a-z0-9_-]{3,20})/gi)) {
      usernames.add(match[2].toLowerCase());
      if (usernames.size === MAX_MENTIONS) break;
    }
    return [...usernames];
  }

  private async replaceMentions(
    tx: Parameters<Parameters<DrizzleWriteService['db']['transaction']>[0]>[0],
    commentId: string,
    eventId: string,
    authorKeycloakSub: string,
    body: string,
    existing: Set<string>,
    replyRecipientKeycloakSub?: string
  ): Promise<PublicEventActor[]> {
    const usernames = this.extractMentionUsernames(body);
    const mentioned =
      usernames.length === 0
        ? []
        : await tx
            .select({
              keycloakSub: profiles.keycloakSub,
              id: profiles.id,
              username: profiles.username,
              firstName: profiles.firstName,
              lastName: profiles.lastName,
              avatarUrl: profiles.avatarUrl
            })
            .from(profiles)
            .where(
              and(
                inArray(sql`lower(${profiles.username})`, usernames),
                eq(profiles.isDeactivated, false),
                ne(profiles.keycloakSub, authorKeycloakSub),
                exists(
                  tx
                    .select({ value: sql`1` })
                    .from(eventComments)
                    .where(
                      and(
                        eq(eventComments.eventId, eventId),
                        eq(eventComments.authorKeycloakSub, profiles.keycloakSub),
                        isNull(eventComments.deletedAt)
                      )
                    )
                ),
                sql`NOT EXISTS (
                  SELECT 1 FROM ${userBlocks} ub
                  WHERE (ub.blocker_keycloak_sub = ${authorKeycloakSub} AND ub.blocked_keycloak_sub = ${profiles.keycloakSub})
                     OR (ub.blocked_keycloak_sub = ${authorKeycloakSub} AND ub.blocker_keycloak_sub = ${profiles.keycloakSub})
                )`
              )
            )
            .limit(MAX_MENTIONS);

    await tx.delete(eventCommentMentions).where(eq(eventCommentMentions.commentId, commentId));
    if (mentioned.length > 0) {
      await tx
        .insert(eventCommentMentions)
        .values(mentioned.map((profile) => ({ commentId, mentionedKeycloakSub: profile.keycloakSub })));
      const eventsToAppend = mentioned
        .filter((profile) => !existing.has(profile.keycloakSub) && profile.keycloakSub !== replyRecipientKeycloakSub)
        .map((profile) => ({
          aggregateId: eventId,
          eventType: 'comment.mentioned',
          payload: {
            commentId,
            actorKeycloakSub: authorKeycloakSub,
            recipientKeycloakSub: profile.keycloakSub
          }
        }));
      if (eventsToAppend.length > 0) await tx.insert(eventOutbox).values(eventsToAppend);
    }
    return mentioned.map((profile) => this.actor(profile));
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
