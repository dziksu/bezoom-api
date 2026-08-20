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
  AttendingEventDto,
  EventCreatorResponseDto,
  MyEventStatsDto,
  EventViewerStateDto
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

  async getMyStats(sub: string): Promise<MyEventStatsDto> {
    const result: unknown = await this.db.execute(sql`
      SELECT
        (
          SELECT count(*)::int
          FROM ${events} created_event
          WHERE created_event.organizer_keycloak_sub = ${sub}
            AND created_event.archived_at IS NULL
        ) AS created,
        (
          SELECT count(*)::int
          FROM ${eventParticipants} participant
          JOIN ${events} attending_event ON attending_event.id = participant.event_id
          WHERE participant.keycloak_sub = ${sub}
            AND participant.status <> 'DECLINED'
            AND attending_event.status = 'PUBLISHED'
            AND attending_event.media_pipeline_status = 'READY'
            AND attending_event.verification_status = 'VERIFIED'
            AND attending_event.visibility = 'PUBLIC'
            AND attending_event.archived_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM ${userBlocks} attendance_block
              WHERE (
                attendance_block.blocker_keycloak_sub = ${sub}
                AND attendance_block.blocked_keycloak_sub = attending_event.organizer_keycloak_sub
              ) OR (
                attendance_block.blocked_keycloak_sub = ${sub}
                AND attendance_block.blocker_keycloak_sub = attending_event.organizer_keycloak_sub
              )
            )
        ) AS attending,
        (
          SELECT count(*)::int
          FROM ${eventSaves} saved_event
          JOIN ${events} saved_event_details ON saved_event_details.id = saved_event.event_id
          WHERE saved_event.keycloak_sub = ${sub}
            AND saved_event_details.status = 'PUBLISHED'
            AND saved_event_details.media_pipeline_status = 'READY'
            AND saved_event_details.verification_status = 'VERIFIED'
            AND saved_event_details.visibility = 'PUBLIC'
            AND saved_event_details.archived_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM ${userBlocks} saved_block
              WHERE (
                saved_block.blocker_keycloak_sub = ${sub}
                AND saved_block.blocked_keycloak_sub = saved_event_details.organizer_keycloak_sub
              ) OR (
                saved_block.blocked_keycloak_sub = ${sub}
                AND saved_block.blocker_keycloak_sub = saved_event_details.organizer_keycloak_sub
              )
            )
        ) AS saved
    `);
    const row = (
      result as {
        rows: Array<{ created: number | string; attending: number | string; saved: number | string }>;
      }
    ).rows[0];

    return {
      created: Number(row?.created ?? 0),
      attending: Number(row?.attending ?? 0),
      saved: Number(row?.saved ?? 0)
    };
  }

  async getViewerState(eventId: string, sub: string): Promise<EventViewerStateDto | null> {
    const result: unknown = await this.db.execute(sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM ${eventLikes} event_like
          WHERE event_like.event_id = visible_event.id
            AND event_like.keycloak_sub = ${sub}
        ) AS liked,
        EXISTS (
          SELECT 1
          FROM ${eventSaves} event_save
          WHERE event_save.event_id = visible_event.id
            AND event_save.keycloak_sub = ${sub}
        ) AS saved,
        (
          SELECT participant.status
          FROM ${eventParticipants} participant
          WHERE participant.event_id = visible_event.id
            AND participant.keycloak_sub = ${sub}
        ) AS rsvp_status
      FROM ${events} visible_event
      WHERE visible_event.id = ${eventId}
        AND visible_event.status = 'PUBLISHED'
        AND visible_event.media_pipeline_status = 'READY'
        AND visible_event.verification_status = 'VERIFIED'
        AND visible_event.visibility = 'PUBLIC'
        AND visible_event.archived_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM ${profiles} organizer
          WHERE organizer.keycloak_sub = visible_event.organizer_keycloak_sub
            AND organizer.account_status = 'ACTIVE'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM ${userBlocks} viewer_block
          WHERE (
            viewer_block.blocker_keycloak_sub = ${sub}
            AND viewer_block.blocked_keycloak_sub = visible_event.organizer_keycloak_sub
          ) OR (
            viewer_block.blocked_keycloak_sub = ${sub}
            AND viewer_block.blocker_keycloak_sub = visible_event.organizer_keycloak_sub
          )
        )
    `);
    const row = (
      result as {
        rows: Array<{
          liked: boolean;
          saved: boolean;
          rsvp_status: EventViewerStateDto['rsvpStatus'];
        }>;
      }
    ).rows[0];

    return row
      ? {
          liked: row.liked,
          saved: row.saved,
          rsvpStatus: row.rsvp_status
        }
      : null;
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
          sql`EXISTS (
            SELECT 1 FROM ${profiles} organizer
            WHERE organizer.keycloak_sub = ${events.organizerKeycloakSub}
              AND organizer.account_status = 'ACTIVE'
          )`,
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
    const creators = await this.fetchCreators([rows[0].event.organizerKeycloakSub]);
    return {
      ...this.mapRow(
        rows[0].event,
        rows[0].location,
        photos.get(id) ?? [],
        creators.get(rows[0].event.organizerKeycloakSub)
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

  async listPublicCreatedByProfile(
    profileId: string,
    viewerKeycloakSub: string | undefined,
    cursorValue: string | undefined,
    limit: number
  ): Promise<CursorPage<EventResponseDto>> {
    const cursorKind = `profile_created_${profileId}`;
    const cursor = decodeTimestampCursor(cursorValue, cursorKind);
    const rows = await this.db
      .select({ event: events, location: locations, cursorAt: events.createdAt, cursorId: events.id })
      .from(events)
      .innerJoin(locations, eq(locations.eventId, events.id))
      .innerJoin(profiles, eq(profiles.keycloakSub, events.organizerKeycloakSub))
      .where(
        and(
          eq(profiles.id, profileId),
          eq(profiles.accountStatus, 'ACTIVE'),
          this.publiclyAvailable(),
          viewerKeycloakSub ? this.notBlocked(viewerKeycloakSub) : undefined,
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

    return this.assembleCursorPage(rows, limit, cursorKind);
  }

  async listPublicAttendanceByProfile(
    profileId: string,
    viewerKeycloakSub: string | undefined,
    cursorValue: string | undefined,
    limit: number
  ): Promise<CursorPage<AttendingEventDto>> {
    const cursorKind = `profile_attending_${profileId}`;
    const cursor = decodeTimestampCursor(cursorValue, cursorKind);
    const target = profiles;
    const rows = await this.db
      .select({
        event: events,
        location: locations,
        myRsvpStatus: eventParticipants.status,
        cursorAt: eventParticipants.joinedAt,
        cursorId: eventParticipants.id
      })
      .from(target)
      .innerJoin(eventParticipants, eq(eventParticipants.keycloakSub, target.keycloakSub))
      .innerJoin(events, eq(events.id, eventParticipants.eventId))
      .innerJoin(locations, eq(locations.eventId, events.id))
      .where(
        and(
          eq(target.id, profileId),
          eq(target.accountStatus, 'ACTIVE'),
          or(eq(target.isPrivate, false), viewerKeycloakSub ? eq(target.keycloakSub, viewerKeycloakSub) : undefined),
          ne(eventParticipants.status, 'DECLINED'),
          this.publiclyAvailable(),
          viewerKeycloakSub ? this.notBlocked(viewerKeycloakSub) : undefined,
          viewerKeycloakSub
            ? sql`NOT EXISTS (
                SELECT 1 FROM ${userBlocks} profile_block
                WHERE (profile_block.blocker_keycloak_sub = ${viewerKeycloakSub} AND profile_block.blocked_keycloak_sub = ${target.keycloakSub})
                   OR (profile_block.blocked_keycloak_sub = ${viewerKeycloakSub} AND profile_block.blocker_keycloak_sub = ${target.keycloakSub})
              )`
            : undefined,
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
    const photos = await this.fetchPhotos(pageRows.map((row) => row.event.id));
    const creators = await this.fetchCreators(pageRows.map((row) => row.event.organizerKeycloakSub));
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row) => ({
        ...this.mapRow(
          row.event,
          row.location,
          photos.get(row.event.id) ?? [],
          creators.get(row.event.organizerKeycloakSub)
        ),
        myRsvpStatus: row.myRsvpStatus
      })),
      hasMore,
      nextCursor: hasMore && last ? encodeTimestampCursor(cursorKind, last.cursorAt, last.cursorId) : undefined
    };
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
    const creators = await this.fetchCreators(pageRows.map((r) => r.event.organizerKeycloakSub));
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((r) => ({
        ...this.mapRow(r.event, r.location, photos.get(r.event.id) ?? [], creators.get(r.event.organizerKeycloakSub)),
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
    const creators = await this.fetchCreators(pageRows.map((r) => r.event.organizerKeycloakSub));
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((r) =>
        this.mapRow(r.event, r.location, photos.get(r.event.id) ?? [], creators.get(r.event.organizerKeycloakSub))
      ),
      hasMore,
      nextCursor: hasMore && last ? encodeTimestampCursor(cursorKind, last.cursorAt, last.cursorId) : undefined
    };
  }

  private async fetchCreators(subs: string[]): Promise<Map<string, EventCreatorResponseDto>> {
    const uniqueSubs = [...new Set(subs)];
    if (uniqueSubs.length === 0) return new Map();

    const rows = await this.db
      .select({
        keycloakSub: profiles.keycloakSub,
        id: profiles.id,
        accountType: profiles.accountType,
        username: profiles.username,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        businessName: profiles.businessName,
        avatarUrl: profiles.avatarUrl,
        followersCount: profiles.followersCount
      })
      .from(profiles)
      .where(inArray(profiles.keycloakSub, uniqueSubs));

    return new Map(
      rows.map((row) => [
        row.keycloakSub,
        {
          id: row.id,
          accountType: row.accountType === 'business' ? ('business' as const) : ('personal' as const),
          username: row.username ?? undefined,
          displayName:
            row.businessName ||
            [row.firstName, row.lastName].filter(Boolean).join(' ') ||
            (row.username ? `@${row.username}` : 'Użytkownik BeZoom'),
          avatarUrl: row.avatarUrl ?? undefined,
          followersCount: row.followersCount
        }
      ])
    );
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
    creator?: EventCreatorResponseDto
  ): EventResponseDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      category: event.category,
      startDate: event.startDate,
      endDate: event.endDate ?? undefined,
      organizerId: creator?.id,
      creatorId: creator?.id,
      creator,
      submittedByIsOrganizer: event.submittedByIsOrganizer,
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
