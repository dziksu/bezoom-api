import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { eventPhotos } from '@api/shared/infrastructure/database/schema';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import type { MapEventPinDto, MapEventsResponseDto } from '../../dto/event-response.dto';
import { GetMapEventsQuery } from './get-map-events.query';
import {
  boundsCoveringSectors,
  sectorCacheKey,
  sectorForPoint,
  sectorsForBounds,
  sectorZoomForMapZoom,
  type MapSector,
  type MapSectorBounds
} from './map-sectors';

type VisibilityLevel = MapEventPinDto['visibilityLevel'];
type SectorScope = 'CITY_PLUS' | 'ALL';

const MAP_SECTOR_CACHE_TTL_SECONDS = 15 * 60;

interface MapPinRow {
  id: string;
  title: string;
  description: string;
  category: string;
  start_date: Date | string;
  end_date: Date | string | null;
  organizer_id: string | null;
  price_type: string | null;
  price_min: string | null;
  price_max: string | null;
  currency: string | null;
  ticket_url: string | null;
  price_notes: string | null;
  amenities: string[] | null;
  status: string;
  verification_status: string;
  created_at: Date | string;
  latitude: string | number;
  longitude: string | number;
  address: string | null;
  city: string | null;
  country: string | null;
  radius_km: number;
}

interface MapAggregateRow {
  events: MapPinRow[] | null;
}

@QueryHandler(GetMapEventsQuery)
export class GetMapEventsHandler implements IQueryHandler<GetMapEventsQuery, MapEventsResponseDto> {
  constructor(
    private readonly readService: DrizzleReadService,
    private readonly writeService: DrizzleWriteService,
    private readonly objectStorage: ObjectStorageService,
    private readonly cache: RedisCacheService
  ) {}

  async execute(query: GetMapEventsQuery): Promise<MapEventsResponseDto> {
    if (query.west >= query.east || query.south >= query.north) {
      throw new BadRequestException('MAP_BOUNDS_INVALID');
    }

    const individualReachKm = this.individualReachForZoom(query.zoom);
    const scope: SectorScope = individualReachKm >= 25 ? 'CITY_PLUS' : 'ALL';
    const sectorZoom = sectorZoomForMapZoom(query.zoom);
    const sectors = sectorsForBounds(query, sectorZoom);
    const version = await this.cache.getVersion('event_map');
    const keyedSectors = sectors.map((sector) => ({
      sector,
      key: sectorCacheKey(version, this.weekCacheKey(query.week), scope, sector)
    }));
    const cached = await this.cache.getMany<MapEventPinDto[]>(
      'event_map_sector',
      keyedSectors.map(({ key }) => key)
    );
    const missing = keyedSectors.filter(({ key }) => !cached.has(key));
    const loaded: Map<string, MapEventPinDto[]> =
      missing.length > 0
        ? await this.loadMissingSectors(query, missing, individualReachKm)
        : new Map<string, MapEventPinDto[]>();

    if (loaded.size > 0) {
      await this.cache.setMany('event_map_sector', loaded, MAP_SECTOR_CACHE_TTL_SECONDS);
    }

    const uniqueEvents = new Map<string, MapEventPinDto>();
    for (const { key } of keyedSectors) {
      for (const event of cached.get(key) ?? loaded.get(key) ?? []) uniqueEvents.set(event.id, event);
    }

    let events = [...uniqueEvents.values()].filter((event) => new Date(event.startDate).getTime() > Date.now());
    if (query.viewerKeycloakSub) {
      const blockedOrganizerIds = await this.blockedOrganizerIds(query.viewerKeycloakSub);
      events = events.filter((event) => !event.organizerId || !blockedOrganizerIds.has(event.organizerId));
    }

    const centerLatitude = (query.south + query.north) / 2;
    const centerLongitude = (query.west + query.east) / 2;
    events = events
      .map((event) => ({
        ...event,
        distanceKm: this.distanceKm(centerLatitude, centerLongitude, event.latitude, event.longitude)
      }))
      .sort((left, right) => right.reachKm - left.reachKm || +new Date(left.startDate) - +new Date(right.startDate));

    return {
      events,
      clusters: [],
      totalCount: events.length,
      representedCount: events.length,
      individualReachKm,
      zoom: query.zoom
    };
  }

  private async loadMissingSectors(
    query: GetMapEventsQuery,
    missing: Array<{ sector: MapSector; key: string }>,
    individualReachKm: number
  ): Promise<Map<string, MapEventPinDto[]>> {
    const loadBounds = boundsCoveringSectors(missing.map(({ sector }) => sector));
    const pinRows = await this.loadRows(loadBounds, query.week, individualReachKm);
    const coverPhotos = await this.fetchCoverPhotos(pinRows.map((event) => event.id));
    const events = pinRows.map((event) => this.mapPin(event, coverPhotos));
    const byCoordinates = new Map(
      missing.map(({ sector, key }) => [`${sector.x}:${sector.y}`, { key, events: [] as MapEventPinDto[] }])
    );

    for (const event of events) {
      const coordinates = sectorForPoint(event.longitude, event.latitude, missing[0].sector.zoom);
      byCoordinates.get(`${coordinates.x}:${coordinates.y}`)?.events.push(event);
    }

    return new Map([...byCoordinates.values()].map(({ key, events: sectorEvents }) => [key, sectorEvents]));
  }

  private async loadRows(
    bounds: MapSectorBounds,
    week: number | undefined,
    individualReachKm: number
  ): Promise<MapPinRow[]> {
    const weekIsNull = week === undefined;
    const weekOffset = week ?? 0;
    const raw: unknown = await this.readService.db.execute(sql`
      WITH params AS (
        SELECT
          ST_MakeEnvelope(${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326) AS envelope,
          (date_trunc('week', (now() AT TIME ZONE 'Europe/Warsaw')) + (${weekOffset} * interval '7 days')) AS week_start
      ),
      candidates AS MATERIALIZED (
        SELECT
          e.id, e.title, e.description, e.category, e.start_date, e.end_date,
          organizer.id AS organizer_id, e.price_type, e.price_min, e.price_max, e.currency,
          e.ticket_url, e.price_notes, e.amenities, e.status, e.verification_status,
          e.created_at, e.radius_km,
          l.latitude, l.longitude, l.address, l.city, l.country
        FROM params p
        JOIN locations l
          ON l.geog && p.envelope::geography
         AND ST_Intersects(l.geog, p.envelope::geography)
        JOIN events e ON e.id = l.event_id
        JOIN profiles organizer ON organizer.keycloak_sub = e.organizer_keycloak_sub
        WHERE e.status = 'PUBLISHED'
          AND e.verification_status = 'VERIFIED'
          AND e.visibility = 'PUBLIC'
          AND e.media_pipeline_status = 'READY'
          AND e.archived_at IS NULL
          AND e.start_date > now()
          AND e.radius_km >= ${individualReachKm}
          AND organizer.account_status = 'ACTIVE'
          AND (
            ${weekIsNull} OR (
              (e.start_date AT TIME ZONE 'Europe/Warsaw') >= p.week_start
              AND (e.start_date AT TIME ZONE 'Europe/Warsaw') < p.week_start + interval '7 days'
            )
          )
      )
      SELECT COALESCE((
        SELECT jsonb_agg(to_jsonb(candidate) ORDER BY candidate.radius_km DESC, candidate.start_date ASC, candidate.id ASC)
        FROM candidates candidate
      ), '[]'::jsonb) AS events
    `);

    return (raw as { rows: MapAggregateRow[] }).rows[0]?.events ?? [];
  }

  private async blockedOrganizerIds(viewerKeycloakSub: string): Promise<Set<string>> {
    const raw: unknown = await this.writeService.db.execute(sql`
      SELECT DISTINCT blocked_profile.id
      FROM user_blocks block
      JOIN profiles blocked_profile
        ON blocked_profile.keycloak_sub = CASE
          WHEN block.blocker_keycloak_sub = ${viewerKeycloakSub} THEN block.blocked_keycloak_sub
          ELSE block.blocker_keycloak_sub
        END
      WHERE block.blocker_keycloak_sub = ${viewerKeycloakSub}
         OR block.blocked_keycloak_sub = ${viewerKeycloakSub}
    `);
    return new Set((raw as { rows: Array<{ id: string }> }).rows.map(({ id }) => id));
  }

  private mapPin(row: MapPinRow, coverPhotos: Map<string, string>): MapEventPinDto {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      startDate: this.databaseDate(row.start_date),
      endDate: row.end_date ? this.databaseDate(row.end_date) : undefined,
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
      verificationStatus: row.verification_status,
      createdAt: this.databaseDate(row.created_at),
      distanceKm: 0,
      coverPhotoUrl: coverPhotos.has(row.id)
        ? this.objectStorage.getPublicUrl(this.objectStorage.mediaBucket, coverPhotos.get(row.id)!)
        : undefined,
      reachKm: Number(row.radius_km),
      visibilityLevel: this.visibilityLevel(Number(row.radius_km))
    };
  }

  private individualReachForZoom(zoom: number): number {
    return zoom < 6 ? 25 : 0;
  }

  private visibilityLevel(radiusKm: number): VisibilityLevel {
    if (radiusKm >= 1_000) return 'NATIONAL';
    if (radiusKm >= 150) return 'REGIONAL';
    if (radiusKm >= 25) return 'CITY';
    return 'LOCAL';
  }

  private async fetchCoverPhotos(eventIds: string[]): Promise<Map<string, string>> {
    if (eventIds.length === 0) return new Map();
    const rows = await this.readService.db
      .selectDistinctOn([eventPhotos.eventId], { eventId: eventPhotos.eventId, mediaKey: eventPhotos.mediaKey })
      .from(eventPhotos)
      .where(and(inArray(eventPhotos.eventId, eventIds), eq(eventPhotos.status, 'READY')))
      .orderBy(eventPhotos.eventId, eventPhotos.position);
    return new Map(
      rows.filter((item) => item.mediaKey).map((item) => [item.eventId as string, item.mediaKey as string])
    );
  }

  private databaseDate(value: Date | string): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('EVENT_TIMESTAMP_INVALID');
    return date;
  }

  private distanceKm(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number): number {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(toLatitude - fromLatitude);
    const longitudeDelta = radians(toLongitude - fromLongitude);
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(fromLatitude)) * Math.cos(radians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
    return Math.round(6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  }

  private weekCacheKey(weekOffset: number | undefined): string | undefined {
    if (weekOffset === undefined) return undefined;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Warsaw',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
    const date = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday + weekOffset * 7);
    return date.toISOString().slice(0, 10);
  }
}
