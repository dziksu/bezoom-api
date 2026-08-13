import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, lt, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { decodeTimestampCursor, encodeTimestampCursor } from '@api/shared/domain/cursor-pagination';
import {
  eventComments,
  eventLikes,
  eventParticipants,
  events,
  profiles,
  userBlocks
} from '@api/shared/infrastructure/database/schema';
import type {
  CursorEventActorsDto,
  CursorEventCommentsDto,
  EventCommentDto,
  PublicEventActorDto
} from '../../application/dto/event-social.dto';

@Injectable()
export class EventSocialReadService {
  constructor(private readonly readService: DrizzleReadService) {}

  private get db() {
    return this.readService.db;
  }

  async listComments(
    eventId: string,
    cursorValue: string | undefined,
    limit: number,
    viewerKeycloakSub?: string
  ): Promise<CursorEventCommentsDto> {
    await this.assertPublicEvent(eventId, viewerKeycloakSub);
    const kind = `event_comments:${eventId}`;
    const cursor = decodeTimestampCursor(cursorValue, kind);
    const rows = await this.db
      .select({
        id: eventComments.id,
        eventId: eventComments.eventId,
        parentId: eventComments.parentId,
        body: eventComments.body,
        createdAt: eventComments.createdAt,
        updatedAt: eventComments.updatedAt,
        editedAt: eventComments.editedAt,
        authorId: profiles.id,
        username: profiles.username,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        avatarUrl: profiles.avatarUrl
      })
      .from(eventComments)
      .innerJoin(profiles, eq(profiles.keycloakSub, eventComments.authorKeycloakSub))
      .where(
        and(
          eq(eventComments.eventId, eventId),
          isNull(eventComments.deletedAt),
          eq(profiles.isDeactivated, false),
          this.notBlocked(viewerKeycloakSub, eventComments.authorKeycloakSub),
          cursor
            ? or(
                lt(eventComments.createdAt, cursor.timestamp),
                and(eq(eventComments.createdAt, cursor.timestamp), lt(eventComments.id, cursor.id))
              )
            : undefined
        )
      )
      .orderBy(desc(eventComments.createdAt), desc(eventComments.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row): EventCommentDto => ({
        id: row.id,
        eventId: row.eventId,
        parentId: row.parentId ?? undefined,
        body: row.body,
        author: this.actor(row),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        isEdited: row.editedAt !== null
      })),
      hasMore,
      nextCursor: hasMore && last ? encodeTimestampCursor(kind, last.createdAt, last.id) : undefined
    };
  }

  async listLikes(
    eventId: string,
    cursorValue: string | undefined,
    limit: number,
    viewerKeycloakSub?: string
  ): Promise<CursorEventActorsDto> {
    await this.assertPublicEvent(eventId, viewerKeycloakSub);
    const kind = `event_likes:${eventId}`;
    const cursor = decodeTimestampCursor(cursorValue, kind);
    const rows = await this.db
      .select({
        cursorId: eventLikes.id,
        cursorAt: eventLikes.createdAt,
        id: profiles.id,
        username: profiles.username,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        avatarUrl: profiles.avatarUrl
      })
      .from(eventLikes)
      .innerJoin(profiles, eq(profiles.keycloakSub, eventLikes.keycloakSub))
      .where(
        and(
          eq(eventLikes.eventId, eventId),
          eq(profiles.isPrivate, false),
          eq(profiles.isDeactivated, false),
          this.notBlocked(viewerKeycloakSub, eventLikes.keycloakSub),
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

    return this.actorPage(rows, limit, kind);
  }

  async listParticipants(
    eventId: string,
    cursorValue: string | undefined,
    limit: number,
    viewerKeycloakSub?: string
  ): Promise<CursorEventActorsDto> {
    await this.assertPublicEvent(eventId, viewerKeycloakSub);
    const kind = `event_participants:${eventId}`;
    const cursor = decodeTimestampCursor(cursorValue, kind);
    const rows = await this.db
      .select({
        cursorId: eventParticipants.id,
        cursorAt: eventParticipants.joinedAt,
        id: profiles.id,
        username: profiles.username,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        avatarUrl: profiles.avatarUrl
      })
      .from(eventParticipants)
      .innerJoin(profiles, eq(profiles.keycloakSub, eventParticipants.keycloakSub))
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.status, 'CONFIRMED'),
          eq(profiles.isPrivate, false),
          eq(profiles.isDeactivated, false),
          this.notBlocked(viewerKeycloakSub, eventParticipants.keycloakSub),
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

    return this.actorPage(rows, limit, kind);
  }

  private async assertPublicEvent(eventId: string, viewerKeycloakSub?: string): Promise<void> {
    const [event] = await this.db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.id, eventId),
          eq(events.status, 'PUBLISHED'),
          eq(events.mediaPipelineStatus, 'READY'),
          eq(events.verificationStatus, 'VERIFIED'),
          eq(events.visibility, 'PUBLIC'),
          isNull(events.archivedAt),
          this.notBlocked(viewerKeycloakSub, events.organizerKeycloakSub)
        )
      )
      .limit(1);
    if (!event) throw new NotFoundException('EVENT_NOT_FOUND');
  }

  private notBlocked(viewerKeycloakSub: string | undefined, otherKeycloakSub: SQLWrapper): SQL | undefined {
    if (!viewerKeycloakSub) return undefined;
    return sql`NOT EXISTS (
      SELECT 1 FROM ${userBlocks} ub
      WHERE (ub.blocker_keycloak_sub = ${viewerKeycloakSub} AND ub.blocked_keycloak_sub = ${otherKeycloakSub})
         OR (ub.blocked_keycloak_sub = ${viewerKeycloakSub} AND ub.blocker_keycloak_sub = ${otherKeycloakSub})
    )`;
  }

  private actorPage(
    rows: Array<{
      cursorId: string;
      cursorAt: Date;
      id: string;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
    }>,
    limit: number,
    kind: string
  ): CursorEventActorsDto {
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row) => this.actor(row)),
      hasMore,
      nextCursor: hasMore && last ? encodeTimestampCursor(kind, last.cursorAt, last.cursorId) : undefined
    };
  }

  private actor(profile: {
    id?: string;
    authorId?: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  }): PublicEventActorDto {
    return {
      id: profile.id ?? profile.authorId!,
      username: profile.username ?? undefined,
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      avatarUrl: profile.avatarUrl ?? undefined
    };
  }
}
