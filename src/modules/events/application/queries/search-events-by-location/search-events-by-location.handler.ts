import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { eventPhotos } from '@api/shared/infrastructure/database/schema';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { SearchEventsByLocationQuery } from './search-events-by-location.query';
import type { EventSearchResponseDto } from '../../dto/event-response.dto';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { decodeGeoCursor, encodeGeoCursor } from '@api/shared/domain/cursor-pagination';
import {
  NATIONAL_EVENT_REACH_RADIUS_KM,
  type EventCategory,
  type EventStatus,
  type VerificationStatus
} from '../../../domain/event.aggregate';
import type { PriceType } from '../../../domain/value-objects/price.vo';

// The maximum national reach bounds the indexed candidate scan. Each event is
// then filtered against its own reach, so Nearby events stay truly nearby.
export const MAX_DISCOVERY_RADIUS_METERS = NATIONAL_EVENT_REACH_RADIUS_KM * 1000;
export const LOCAL_DISCOVERY_RADIUS_METERS = 5_000;

interface SearchRow {
  [key: string]: unknown;
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  start_date: Date | string;
  end_date: Date | string | null;
  organizer_id: string | null;
  submitted_by_is_organizer: boolean;
  price_type: PriceType | null;
  price_min: string | null;
  price_max: string | null;
  currency: string | null;
  ticket_url: string | null;
  price_notes: string | null;
  amenities: string[] | null;
  status: EventStatus;
  verification_status: VerificationStatus;
  created_at: Date | string;
  latitude: string;
  longitude: string;
  address: string | null;
  city: string | null;
  country: string | null;
  distance_m: number;
}

@QueryHandler(SearchEventsByLocationQuery)
export class SearchEventsByLocationHandler implements IQueryHandler<
  SearchEventsByLocationQuery,
  EventSearchResponseDto
> {
  constructor(
    private readonly readService: DrizzleReadService,
    private readonly writeService: DrizzleWriteService,
    private readonly objectStorage: ObjectStorageService,
    private readonly cache: RedisCacheService
  ) {}

  async execute(query: SearchEventsByLocationQuery): Promise<EventSearchResponseDto> {
    // Personalized safety filtering must reflect a new block immediately. Only
    // the anonymous hot path is shared in Redis.
    if (query.viewerKeycloakSub) return this.search(query);

    const cursorKey = query.cursor ? createHash('sha256').update(query.cursor).digest('hex') : 'first';
    const key = [query.lat.toFixed(4), query.lng.toFixed(4), query.week ?? 'all', cursorKey, query.limit].join(':');
    return this.cache.getOrSet('event_search', key, 15, () => this.search(query));
  }

  private async search(query: SearchEventsByLocationQuery): Promise<EventSearchResponseDto> {
    const cursor = decodeGeoCursor(query.cursor, query);
    // One extra row provides hasMore without forcing PostgreSQL to count every
    // matching event before it can return the first batch.
    const fetchLimit = query.limit + 1;
    const weekIsNull = query.week === undefined;
    const week = query.week ?? 0;

    // Personalized safety filtering runs on the primary to avoid replica lag;
    // anonymous high-volume discovery stays on the read side.
    const queryDb = query.viewerKeycloakSub ? this.writeService.db : this.readService.db;
    const result: unknown = await queryDb.execute(sql`
      WITH params AS (
        SELECT
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography AS origin,
          (date_trunc('week', (now() AT TIME ZONE 'Europe/Warsaw')) + (${week} * interval '7 days')) AS week_start
      )
      , eligible_events AS NOT MATERIALIZED (
        SELECT e.id, e.radius_km, organizer.id AS organizer_id
        FROM params p
        JOIN events e ON true
        JOIN profiles organizer ON organizer.keycloak_sub = e.organizer_keycloak_sub
        WHERE e.status = 'PUBLISHED'
          AND e.verification_status = 'VERIFIED'
          AND e.visibility = 'PUBLIC'
          AND e.media_pipeline_status = 'READY'
          AND e.archived_at IS NULL
          AND e.start_date > now()
          AND organizer.account_status = 'ACTIVE'
          AND (
            ${query.viewerKeycloakSub ?? null}::text IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM user_blocks ub
              WHERE (ub.blocker_keycloak_sub = ${query.viewerKeycloakSub ?? null} AND ub.blocked_keycloak_sub = e.organizer_keycloak_sub)
                 OR (ub.blocked_keycloak_sub = ${query.viewerKeycloakSub ?? null} AND ub.blocker_keycloak_sub = e.organizer_keycloak_sub)
            )
          )
          AND (
            ${weekIsNull} OR (
              (e.start_date AT TIME ZONE 'Europe/Warsaw') >= p.week_start
              AND (e.start_date AT TIME ZONE 'Europe/Warsaw') < p.week_start + interval '7 days'
            )
          )
      )
      , nearby AS MATERIALIZED (
        SELECT
          l.event_id, l.latitude, l.longitude, l.address, l.city, l.country,
          eligible.organizer_id,
          ST_Distance(l.geog, p.origin, false) AS distance_m
        FROM params p
        JOIN locations l ON ST_DWithin(l.geog, p.origin, ${LOCAL_DISCOVERY_RADIUS_METERS}, false)
        JOIN eligible_events eligible ON eligible.id = l.event_id AND eligible.radius_km <= 5

        UNION ALL

        SELECT
          l.event_id, l.latitude, l.longitude, l.address, l.city, l.country,
          eligible.organizer_id,
          ST_Distance(l.geog, p.origin, false) AS distance_m
        FROM params p
        JOIN eligible_events eligible ON eligible.radius_km > 5
        JOIN locations l ON l.event_id = eligible.id
        WHERE ST_DWithin(l.geog, p.origin, eligible.radius_km * 1000, false)
      )
      , candidates AS (
        SELECT
          e.id, e.title, e.description, e.category, e.start_date, e.end_date,
          l.organizer_id, e.submitted_by_is_organizer, e.price_type, e.price_min, e.price_max, e.currency,
          e.ticket_url, e.price_notes, e.amenities, e.status,
          e.verification_status, e.created_at,
          l.latitude, l.longitude, l.address, l.city, l.country,
          l.distance_m
        FROM nearby l
        JOIN events e ON e.id = l.event_id
        WHERE l.distance_m <= e.radius_km * 1000
      )
      SELECT * FROM candidates
      WHERE ${cursor?.distanceMeters ?? null}::double precision IS NULL
         OR distance_m > ${cursor?.distanceMeters ?? null}
         OR (distance_m = ${cursor?.distanceMeters ?? null} AND id > ${cursor?.id ?? null}::uuid)
      ORDER BY distance_m ASC, id ASC
      LIMIT ${fetchLimit}
    `);

    const fetchedRows = (result as { rows: SearchRow[] }).rows;
    const hasMore = fetchedRows.length > query.limit;
    const rows = fetchedRows.slice(0, query.limit);

    const eventIds = rows.map((r) => r.id);
    const coverPhotos = await this.fetchCoverPhotos(eventIds);

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        startDate: this.databaseDate(row.start_date),
        endDate: row.end_date ? this.databaseDate(row.end_date) : undefined,
        organizerId: row.organizer_id ?? undefined,
        creatorId: row.organizer_id ?? undefined,
        submittedByIsOrganizer: row.submitted_by_is_organizer,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        address: row.address ?? undefined,
        city: row.city ?? undefined,
        country: row.country ?? 'PL',
        priceType: row.price_type ?? 'FREE',
        priceMin: row.price_min ? Number(row.price_min) : undefined,
        priceMax: row.price_max ? Number(row.price_max) : undefined,
        currency: row.currency ?? 'PLN',
        ticketUrl: row.ticket_url ?? undefined,
        priceNotes: row.price_notes ?? undefined,
        amenities: row.amenities ?? [],
        photos: [],
        status: row.status,
        verificationStatus: row.verification_status,
        createdAt: this.databaseDate(row.created_at),
        distanceKm: Math.round((row.distance_m / 1000) * 10) / 10,
        coverPhotoUrl: coverPhotos.has(row.id)
          ? this.objectStorage.getPublicUrl(this.objectStorage.mediaBucket, coverPhotos.get(row.id)!)
          : undefined
      })),
      hasMore,
      nextCursor:
        hasMore && rows.length > 0
          ? encodeGeoCursor({
              distanceMeters: Number(rows[rows.length - 1].distance_m),
              id: rows[rows.length - 1].id,
              lat: query.lat,
              lng: query.lng,
              week: query.week ?? null
            })
          : undefined
    };
  }

  private async fetchCoverPhotos(eventIds: string[]): Promise<Map<string, string>> {
    if (eventIds.length === 0) return new Map();

    const rows = await this.readService.db
      .selectDistinctOn([eventPhotos.eventId], { eventId: eventPhotos.eventId, mediaKey: eventPhotos.mediaKey })
      .from(eventPhotos)
      .where(and(inArray(eventPhotos.eventId, eventIds), eq(eventPhotos.status, 'READY')))
      .orderBy(eventPhotos.eventId, eventPhotos.position);

    return new Map(rows.filter((r) => r.mediaKey).map((r) => [r.eventId as string, r.mediaKey as string]));
  }

  /** Raw pg execution returns timestamptz as text in this read path. */
  private databaseDate(value: Date | string): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('EVENT_TIMESTAMP_INVALID');
    return date;
  }
}
