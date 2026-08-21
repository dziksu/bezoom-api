import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { sql } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import type { MapEventPinDto, MapEventsResponseDto } from '../../dto/event-response.dto';
import { GetMapEventsQuery } from './get-map-events.query';
import type { EventCategory } from '../../../domain/event.aggregate';
import {
  boundsCoveringSectors,
  countSectorsForBounds,
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
const MAP_COUNT_CACHE_TTL_SECONDS = 60;
export const MAX_MAP_VIEWPORT_SECTORS = 64;
export const MAX_MAP_COUNT_SECTORS = 256;

interface MapPinRow {
  id: string;
  title: string;
  category: EventCategory;
  start_date: Date | string;
  end_date: Date | string | null;
  organizer_id: string | null;
  latitude: string | number;
  longitude: string | number;
  address: string | null;
  city: string | null;
  country: string | null;
  radius_km: number;
  cover_media_key: string;
}

interface MapCountRow {
  count: string | number;
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
    const viewport = this.viewportBounds(query);
    const countBounds = this.countBounds(query);
    const sectorZoom = sectorZoomForMapZoom(query.zoom);
    this.assertSectorBudget(viewport, sectorZoom, MAX_MAP_VIEWPORT_SECTORS, 'MAP_VIEWPORT_TOO_LARGE');
    this.assertSectorBudget(countBounds, sectorZoom, MAX_MAP_COUNT_SECTORS, 'MAP_COUNT_BOUNDS_TOO_LARGE');

    const individualReachKm = this.individualReachForZoom(query.zoom);
    const scope: SectorScope = individualReachKm >= 25 ? 'CITY_PLUS' : 'ALL';
    const sectors = sectorsForBounds(viewport, sectorZoom);
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
    const loaded =
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

    const blockedOrganizerIds = query.viewerKeycloakSub
      ? await this.blockedOrganizerIds(query.viewerKeycloakSub)
      : new Set<string>();
    const centerLatitude = (query.south + query.north) / 2;
    const centerLongitude = (query.west + query.east) / 2;
    const eligibleEvents = [...uniqueEvents.values()]
      .filter((event) => this.isInside(event, viewport))
      .filter((event) => new Date(event.startDate).getTime() > Date.now())
      .filter((event) => !event.organizerId || !blockedOrganizerIds.has(event.organizerId))
      .map((event) => ({
        ...event,
        distanceKm: this.distanceKm(centerLatitude, centerLongitude, event.latitude, event.longitude)
      }))
      .sort((left, right) => right.reachKm - left.reachKm || +new Date(left.startDate) - +new Date(right.startDate));

    const countCanBeDerived = individualReachKm === 0 && this.sameBounds(viewport, countBounds);
    const totalCount = countCanBeDerived
      ? eligibleEvents.length
      : await this.loadTotalCount(countBounds, query.week, blockedOrganizerIds, version);
    return {
      events: eligibleEvents,
      clusters: [],
      totalCount,
      returnedCount: eligibleEvents.length,
      representedCount: eligibleEvents.length,
      individualReachKm,
      zoom: query.zoom
    };
  }

  private viewportBounds(query: GetMapEventsQuery): MapSectorBounds {
    const bounds = { west: query.west, south: query.south, east: query.east, north: query.north };
    this.assertBounds(bounds, 'MAP_BOUNDS_INVALID');
    return bounds;
  }

  private countBounds(query: GetMapEventsQuery): MapSectorBounds {
    const supplied = [query.countWest, query.countSouth, query.countEast, query.countNorth];
    const suppliedCount = supplied.filter((value) => value !== undefined).length;
    if (suppliedCount !== 0 && suppliedCount !== supplied.length) {
      throw new BadRequestException('MAP_COUNT_BOUNDS_INCOMPLETE');
    }
    const bounds =
      suppliedCount === supplied.length
        ? { west: query.countWest!, south: query.countSouth!, east: query.countEast!, north: query.countNorth! }
        : this.viewportBounds(query);
    this.assertBounds(bounds, 'MAP_COUNT_BOUNDS_INVALID');
    return bounds;
  }

  private assertBounds(bounds: MapSectorBounds, code: string): void {
    if (bounds.west >= bounds.east || bounds.south >= bounds.north) throw new BadRequestException(code);
  }

  private assertSectorBudget(bounds: MapSectorBounds, zoom: number, maximum: number, code: string): void {
    if (countSectorsForBounds(bounds, zoom) > maximum) throw new BadRequestException(code);
  }

  private async loadTotalCount(
    bounds: MapSectorBounds,
    week: number | undefined,
    blockedOrganizerIds: Set<string>,
    version: number
  ): Promise<number> {
    if (blockedOrganizerIds.size > 0) return this.loadTotalCountFromDatabase(bounds, week, blockedOrganizerIds);

    const key = [
      `v${version}`,
      this.weekCacheKey(week) ?? 'all',
      bounds.west.toFixed(5),
      bounds.south.toFixed(5),
      bounds.east.toFixed(5),
      bounds.north.toFixed(5)
    ].join(':');
    return this.cache.getOrSet('event_map_count', key, MAP_COUNT_CACHE_TTL_SECONDS, () =>
      this.loadTotalCountFromDatabase(bounds, week, blockedOrganizerIds)
    );
  }

  private async loadTotalCountFromDatabase(
    bounds: MapSectorBounds,
    week: number | undefined,
    blockedOrganizerIds: Set<string>
  ): Promise<number> {
    const weekIsNull = week === undefined;
    const weekOffset = week ?? 0;
    const blockedFilter =
      blockedOrganizerIds.size > 0
        ? sql`AND organizer.id NOT IN (${sql.join(
            [...blockedOrganizerIds].map((id) => sql`${id}`),
            sql`, `
          )})`
        : sql``;
    const raw: unknown = await this.readService.db.execute(sql`
      WITH params AS (
        SELECT
          ST_MakeEnvelope(${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326) AS envelope,
          (date_trunc('week', (now() AT TIME ZONE 'Europe/Warsaw')) + (${weekOffset} * interval '7 days')) AS week_start
      )
      SELECT count(*)::int AS count
      FROM params p
      JOIN locations l ON ST_Intersects(l.geom, p.envelope)
      JOIN events e ON e.id = l.event_id
      JOIN profiles organizer ON organizer.keycloak_sub = e.organizer_keycloak_sub
      WHERE e.status = 'PUBLISHED'
        AND e.verification_status = 'VERIFIED'
        AND e.visibility = 'PUBLIC'
        AND e.media_pipeline_status = 'READY'
        AND e.archived_at IS NULL
        AND e.start_date > now()
        AND organizer.account_status = 'ACTIVE'
        ${blockedFilter}
        AND (
          ${weekIsNull} OR (
            (e.start_date AT TIME ZONE 'Europe/Warsaw') >= p.week_start
            AND (e.start_date AT TIME ZONE 'Europe/Warsaw') < p.week_start + interval '7 days'
          )
        )
    `);
    return Number((raw as { rows: MapCountRow[] }).rows[0]?.count ?? 0);
  }

  private async loadMissingSectors(
    query: GetMapEventsQuery,
    missing: Array<{ sector: MapSector; key: string }>,
    individualReachKm: number
  ): Promise<Map<string, MapEventPinDto[]>> {
    const loadBounds = boundsCoveringSectors(missing.map(({ sector }) => sector));
    const pinRows = await this.loadRows(loadBounds, query.week, individualReachKm);
    const events = pinRows.map((event) => this.mapPin(event));
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
      )
      SELECT
        e.id, e.title, e.category, e.start_date, e.end_date,
        organizer.id AS organizer_id, e.radius_km,
        l.latitude, l.longitude, l.address, l.city, l.country,
        cover.media_key AS cover_media_key
      FROM params p
      JOIN locations l ON ST_Intersects(l.geom, p.envelope)
      JOIN events e ON e.id = l.event_id
      JOIN profiles organizer ON organizer.keycloak_sub = e.organizer_keycloak_sub
      JOIN LATERAL (
        SELECT photo.media_key
        FROM event_photos photo
        WHERE photo.event_id = e.id
          AND photo.status = 'READY'
          AND photo.media_key IS NOT NULL
        ORDER BY photo.position ASC NULLS LAST, photo.id ASC
        LIMIT 1
      ) cover ON true
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
      ORDER BY e.radius_km DESC, e.start_date ASC, e.id ASC
    `);

    return (raw as { rows: MapPinRow[] }).rows;
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

  private mapPin(row: MapPinRow): MapEventPinDto {
    return {
      id: row.id,
      title: row.title,
      coverPhotoUrl: this.objectStorage.getPublicUrl(this.objectStorage.mediaBucket, row.cover_media_key),
      category: row.category,
      startDate: this.databaseDate(row.start_date),
      endDate: row.end_date ? this.databaseDate(row.end_date) : undefined,
      organizerId: row.organizer_id ?? undefined,
      creatorId: row.organizer_id ?? undefined,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      address: row.address ?? undefined,
      city: row.city ?? undefined,
      country: row.country ?? 'PL',
      distanceKm: 0,
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
    if (radiusKm >= 5) return 'LOCAL';
    return 'NEARBY';
  }

  private isInside(event: MapEventPinDto, bounds: MapSectorBounds): boolean {
    return (
      event.longitude >= bounds.west &&
      event.longitude <= bounds.east &&
      event.latitude >= bounds.south &&
      event.latitude <= bounds.north
    );
  }

  private sameBounds(left: MapSectorBounds, right: MapSectorBounds): boolean {
    return (
      left.west === right.west && left.south === right.south && left.east === right.east && left.north === right.north
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
