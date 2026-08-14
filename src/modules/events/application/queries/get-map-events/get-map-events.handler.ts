import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { eventPhotos } from '@api/shared/infrastructure/database/schema';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import type {
  MapEventClusterDto,
  MapEventPinDto,
  MapEventsResponseDto
} from '../../dto/event-response.dto';
import { GetMapEventsQuery } from './get-map-events.query';

type VisibilityLevel = MapEventPinDto['visibilityLevel'];

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
  distance_m: number;
}

interface MapAggregateRow {
  total_count: number | string;
  represented_count: number | string;
  events: MapPinRow[] | null;
  clusters: Array<{
    id: string;
    latitude: number | string;
    longitude: number | string;
    count: number | string;
    west: number | string;
    south: number | string;
    east: number | string;
    north: number | string;
  }> | null;
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

    if (query.viewerKeycloakSub) return this.load(query);

    const key = [
      query.west.toFixed(4),
      query.south.toFixed(4),
      query.east.toFixed(4),
      query.north.toFixed(4),
      query.zoom.toFixed(1),
      query.week ?? 'all'
    ].join(':');
    return this.cache.getOrSet('event_map', createHash('sha256').update(key).digest('hex'), 15, () =>
      this.load(query)
    );
  }

  private async load(query: GetMapEventsQuery): Promise<MapEventsResponseDto> {
    const individualReachKm = this.individualReachForZoom(query.zoom);
    const cellSizeMeters = this.clusterCellSizeMeters(query.zoom);
    const weekIsNull = query.week === undefined;
    const week = query.week ?? 0;
    const centerLng = (query.west + query.east) / 2;
    const centerLat = (query.south + query.north) / 2;
    const queryDb = query.viewerKeycloakSub ? this.writeService.db : this.readService.db;

    const raw: unknown = await queryDb.execute(sql`
      WITH params AS (
        SELECT
          ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326) AS envelope,
          ST_SetSRID(ST_MakePoint(${centerLng}, ${centerLat}), 4326)::geography AS center,
          (date_trunc('week', (now() AT TIME ZONE 'Europe/Warsaw')) + (${week} * interval '7 days')) AS week_start
      ),
      candidates AS MATERIALIZED (
        SELECT
          e.id, e.title, e.description, e.category, e.start_date, e.end_date,
          organizer.id AS organizer_id, e.price_type, e.price_min, e.price_max, e.currency,
          e.ticket_url, e.price_notes, e.amenities, e.status, e.verification_status,
          e.created_at, e.radius_km,
          l.latitude, l.longitude, l.address, l.city, l.country,
          ST_Distance(l.geog, p.center, false) AS distance_m
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
          AND organizer.account_status = 'ACTIVE'
          AND (
            ${query.viewerKeycloakSub ?? null}::text IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM user_blocks ub
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
      ),
      pins AS MATERIALIZED (
        SELECT * FROM candidates
        WHERE radius_km >= ${individualReachKm}
      ),
      cluster_members AS (
        SELECT
          c.*,
          ST_SnapToGrid(
            ST_Transform(ST_SetSRID(ST_MakePoint(c.longitude::float8, c.latitude::float8), 4326), 3857),
            ${cellSizeMeters}
          ) AS cell
        FROM candidates c
        WHERE c.radius_km < ${individualReachKm}
      ),
      grouped_clusters AS (
        SELECT
          md5(ST_AsText(cell)) AS id,
          avg(latitude::float8) AS latitude,
          avg(longitude::float8) AS longitude,
          count(*) AS count,
          min(longitude::float8) AS west,
          min(latitude::float8) AS south,
          max(longitude::float8) AS east,
          max(latitude::float8) AS north
        FROM cluster_members
        GROUP BY cell
      )
      SELECT
        (SELECT count(*) FROM candidates) AS total_count,
        (SELECT count(*) FROM pins) + COALESCE((SELECT sum(count) FROM grouped_clusters), 0) AS represented_count,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.radius_km DESC, p.start_date ASC, p.id ASC)
          FROM pins p
        ), '[]'::jsonb) AS events,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(c) ORDER BY c.count DESC, c.id ASC)
          FROM grouped_clusters c
        ), '[]'::jsonb) AS clusters
    `);

    const row = (raw as { rows: MapAggregateRow[] }).rows[0];
    const pinRows = row?.events ?? [];
    const coverPhotos = await this.fetchCoverPhotos(pinRows.map((event) => event.id));
    const events = pinRows.map((event) => this.mapPin(event, coverPhotos));
    const clusters = (row?.clusters ?? []).map((cluster): MapEventClusterDto => ({
      id: cluster.id,
      latitude: Number(cluster.latitude),
      longitude: Number(cluster.longitude),
      count: Number(cluster.count),
      bounds: {
        west: Number(cluster.west),
        south: Number(cluster.south),
        east: Number(cluster.east),
        north: Number(cluster.north)
      }
    }));

    return {
      events,
      clusters,
      totalCount: Number(row?.total_count ?? 0),
      representedCount: Number(row?.represented_count ?? 0),
      individualReachKm,
      zoom: query.zoom
    };
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
      distanceKm: Math.round((Number(row.distance_m) / 1000) * 10) / 10,
      coverPhotoUrl: coverPhotos.has(row.id)
        ? this.objectStorage.getPublicUrl(this.objectStorage.mediaBucket, coverPhotos.get(row.id)!)
        : undefined,
      reachKm: Number(row.radius_km),
      visibilityLevel: this.visibilityLevel(Number(row.radius_km))
    };
  }

  private individualReachForZoom(zoom: number): number {
    if (zoom < 6) return 1_000;
    if (zoom < 8) return 150;
    if (zoom < 11) return 25;
    return 5;
  }

  private clusterCellSizeMeters(zoom: number): number {
    return Math.max(200, Math.round(10_018_754 / 2 ** zoom));
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
    return new Map(rows.filter((item) => item.mediaKey).map((item) => [item.eventId as string, item.mediaKey as string]));
  }

  private databaseDate(value: Date | string): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('EVENT_TIMESTAMP_INVALID');
    return date;
  }
}
