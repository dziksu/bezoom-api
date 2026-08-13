import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { eventPhotos } from '@api/shared/infrastructure/database/schema';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { SearchEventsByLocationQuery } from './search-events-by-location.query';
import type { EventSearchResponseDto } from '../../dto/event-response.dto';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { MVP_EVENT_REACH_RADIUS_KM } from '../../../domain/event.aggregate';

export const MVP_DISCOVERY_RADIUS_METERS = MVP_EVENT_REACH_RADIUS_KM * 1000;

interface SearchRow {
  [key: string]: unknown;
  id: string;
  title: string;
  description: string;
  category: string;
  start_date: Date;
  end_date: Date | null;
  organizer_id: string | null;
  price_type: string | null;
  price_min: string | null;
  price_max: string | null;
  currency: string | null;
  ticket_url: string | null;
  price_notes: string | null;
  amenities: string[] | null;
  status: string;
  visibility: string;
  verification_status: string;
  created_at: Date;
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
    private readonly objectStorage: ObjectStorageService,
    private readonly cache: RedisCacheService
  ) {}

  async execute(query: SearchEventsByLocationQuery): Promise<EventSearchResponseDto> {
    const key = [query.lat.toFixed(4), query.lng.toFixed(4), query.week ?? 'all', query.page, query.limit].join(':');
    return this.cache.getOrSet('event_search', key, 15, () => this.search(query));
  }

  private async search(query: SearchEventsByLocationQuery): Promise<EventSearchResponseDto> {
    const offset = (query.page - 1) * query.limit;
    // One extra row provides hasMore without forcing PostgreSQL to count every
    // matching event before it can return the first page.
    const fetchLimit = query.limit + 1;
    const weekIsNull = query.week === undefined;
    const week = query.week ?? 0;

    const result: unknown = await this.readService.db.execute(sql`
      WITH params AS (
        SELECT
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography AS origin,
          (date_trunc('week', (now() AT TIME ZONE 'Europe/Warsaw')) + (${week} * interval '7 days')) AS week_start
      )
      SELECT
        e.id, e.title, e.description, e.category, e.start_date, e.end_date,
        organizer.id AS organizer_id, e.price_type, e.price_min, e.price_max, e.currency,
        e.ticket_url, e.price_notes, e.amenities, e.status, e.visibility,
        e.verification_status, e.created_at,
        l.latitude, l.longitude, l.address, l.city, l.country,
        ST_Distance(l.geog, p.origin) AS distance_m
      FROM params p
      JOIN locations l ON ST_DWithin(l.geog, p.origin, ${MVP_DISCOVERY_RADIUS_METERS})
      JOIN events e ON e.id = l.event_id
      LEFT JOIN profiles organizer ON organizer.keycloak_sub = e.organizer_keycloak_sub
      WHERE e.status = 'PUBLISHED'
        AND e.verification_status = 'VERIFIED'
        AND e.visibility = 'PUBLIC'
        AND e.media_pipeline_status = 'READY'
        AND e.radius_km = ${MVP_EVENT_REACH_RADIUS_KM}
        AND e.start_date > now()
        AND (
          ${weekIsNull} OR (
            (e.start_date AT TIME ZONE 'Europe/Warsaw') >= p.week_start
            AND (e.start_date AT TIME ZONE 'Europe/Warsaw') < p.week_start + interval '7 days'
          )
        )
      ORDER BY distance_m ASC, e.id ASC
      LIMIT ${fetchLimit} OFFSET ${offset}
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
        startDate: row.start_date,
        endDate: row.end_date ?? undefined,
        organizerId: row.organizer_id ?? undefined,
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
        visibility: row.visibility,
        verificationStatus: row.verification_status,
        createdAt: row.created_at,
        distanceKm: Math.round((row.distance_m / 1000) * 10) / 10,
        coverPhotoUrl: coverPhotos.has(row.id)
          ? this.objectStorage.getPublicUrl(this.objectStorage.mediaBucket, coverPhotos.get(row.id)!)
          : undefined
      })),
      page: query.page,
      limit: query.limit,
      hasMore
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
}
