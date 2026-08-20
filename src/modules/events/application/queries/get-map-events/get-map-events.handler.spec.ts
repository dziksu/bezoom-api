import { BadRequestException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import type { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import type { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import type { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { GetMapEventsHandler } from './get-map-events.handler';
import { GetMapEventsQuery } from './get-map-events.query';

describe('GetMapEventsHandler', () => {
  let capturedStatements: SQL[] = [];
  let totalCountResult = 0;
  let mapRows: Array<Record<string, unknown>> = [];
  const execute = jest.fn((statement: SQL) => {
    capturedStatements.push(statement);
    const normalizedSql = new PgDialect().sqlToQuery(statement).sql.replace(/\s+/g, ' ').toLowerCase();
    return Promise.resolve({
      rows: normalizedSql.includes('select count(*)::int as count') ? [{ count: totalCountResult }] : mapRows
    });
  });
  const readService = { db: { execute } } as unknown as DrizzleReadService;
  const writeService = { db: { execute } } as unknown as DrizzleWriteService;
  const objectStorage = {
    mediaBucket: 'bezoom-media',
    getPublicUrl: jest.fn((bucket: string, key: string) => `https://media.test/${bucket}/${key}`)
  } as unknown as ObjectStorageService;
  const cacheGetMany = jest.fn().mockResolvedValue(new Map());
  const cacheSetMany = jest.fn().mockResolvedValue(undefined);
  const cacheGetOrSet = jest.fn((_namespace: string, _key: string, _ttl: number, loader: () => Promise<number>) =>
    loader()
  );
  const cache = {
    getVersion: jest.fn().mockResolvedValue(1),
    getMany: cacheGetMany,
    setMany: cacheSetMany,
    getOrSet: cacheGetOrSet
  } as unknown as RedisCacheService;
  const handler = new GetMapEventsHandler(readService, writeService, objectStorage, cache);

  beforeEach(() => {
    jest.clearAllMocks();
    capturedStatements = [];
    totalCountResult = 0;
    mapRows = [];
    cacheGetMany.mockResolvedValue(new Map());
    cacheGetOrSet.mockImplementation((_namespace: string, _key: string, _ttl: number, loader: () => Promise<number>) =>
      loader()
    );
  });

  it('loads compact pins with the geometry index and derives a same-viewport total', async () => {
    const result = await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10, 0));

    expect(capturedStatements).toHaveLength(1);
    const normalizedSql = new PgDialect().sqlToQuery(capturedStatements[0]).sql.replace(/\s+/g, ' ').toLowerCase();
    expect(normalizedSql).toContain('join locations l on st_intersects(l.geom');
    expect(normalizedSql).toContain('join lateral');
    expect(normalizedSql).toContain("photo.status = 'ready'");
    expect(normalizedSql).toContain('and e.radius_km >=');
    expect(normalizedSql).not.toContain('jsonb_agg');
    expect(normalizedSql).not.toContain('e.description');
    expect(normalizedSql).not.toContain('count(*)');
    expect(result).toMatchObject({
      totalCount: 0,
      returnedCount: 0,
      representedCount: 0,
      individualReachKm: 0,
      events: [],
      clusters: []
    });
    expect(cacheGetMany).toHaveBeenCalledWith(
      'event_map_sector',
      expect.arrayContaining([expect.stringMatching(/^map-v4:v1:\d{4}-\d{2}-\d{2}:ALL:9:/)])
    );
    expect(cacheSetMany).toHaveBeenCalledTimes(1);
  });

  it('returns the required cover URL without loading full event details', async () => {
    mapRows = [
      {
        id: 'event-with-cover',
        title: 'Event with cover',
        category: 'MUSIC_AND_NIGHTLIFE',
        start_date: new Date(Date.now() + 86_400_000),
        end_date: null,
        organizer_id: 'organizer-id',
        latitude: 52.2,
        longitude: 21.05,
        address: null,
        city: 'Warszawa',
        country: 'PL',
        radius_km: 150,
        cover_media_key: 'events/event-with-cover/cover.webp'
      }
    ];

    const result = await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10, 0));

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: 'event-with-cover',
      coverPhotoUrl: 'https://media.test/bezoom-media/events/event-with-cover/cover.webp'
    });
    expect(result.events[0]).not.toHaveProperty('description');
    expect(result.events[0]).not.toHaveProperty('photos');
  });

  it('includes city, regional and national reach at a country-level zoom', async () => {
    const result = await handler.execute(new GetMapEventsQuery(14.1, 49, 24.2, 54.9, 5, undefined));
    expect(result.individualReachKm).toBe(25);
    expect(cacheGetOrSet).toHaveBeenCalledTimes(1);
  });

  it('includes local reach from a regional-level zoom', async () => {
    const result = await handler.execute(new GetMapEventsQuery(14.1, 49, 24.2, 54.9, 6, undefined));
    expect(result.individualReachKm).toBe(0);
  });

  it('maps every configured reach boundary to its visibility level', () => {
    const visibilityLevel = (radiusKm: number) =>
      (handler as unknown as { visibilityLevel: (value: number) => string }).visibilityLevel(radiusKm);

    expect(visibilityLevel(1)).toBe('NEARBY');
    expect(visibilityLevel(4)).toBe('NEARBY');
    expect(visibilityLevel(5)).toBe('LOCAL');
    expect(visibilityLevel(25)).toBe('CITY');
    expect(visibilityLevel(150)).toBe('REGIONAL');
    expect(visibilityLevel(1_000)).toBe('NATIONAL');
  });

  it('uses the same sector keys for fractional movement within a zoom level', async () => {
    await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10.1, 0));
    const firstKeys = cacheGetMany.mock.calls.at(-1)?.[1] as string[] | undefined;
    await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10.9, 0));
    const secondKeys = cacheGetMany.mock.calls.at(-1)?.[1] as string[] | undefined;
    expect(secondKeys).toEqual(firstKeys);
  });

  it('serves a fully cached sector coverage without querying PostGIS', async () => {
    cacheGetMany.mockImplementationOnce((_namespace: string, keys: string[]) =>
      Promise.resolve(
        new Map(
          keys.map((key, index) => [
            key,
            index === 0
              ? [
                  {
                    id: 'cached-event',
                    title: 'Cached event',
                    coverPhotoUrl: 'https://media.test/cached-event.webp',
                    category: 'ENTERTAINMENT',
                    startDate: new Date(Date.now() + 86_400_000).toISOString(),
                    latitude: 52.2,
                    longitude: 21.05,
                    country: 'PL',
                    distanceKm: 0,
                    reachKm: 150,
                    visibilityLevel: 'REGIONAL'
                  }
                ]
              : []
          ])
        )
      )
    );

    const result = await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10, 0));
    expect(execute).not.toHaveBeenCalled();
    expect(result.events).toHaveLength(1);
    expect(result.returnedCount).toBe(1);
    expect(result.events[0]).toMatchObject({ id: 'cached-event' });
    expect(typeof result.events[0].distanceKm).toBe('number');
  });

  it('returns dense compact pins without moving frontend-owned events into clusters', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const cachedEvents = Array.from({ length: 600 }, (_, index) => ({
      id: `event-${index}`,
      title: `Event ${index}`,
      coverPhotoUrl: `https://media.test/event-${index}.webp`,
      category: 'ENTERTAINMENT',
      startDate: future,
      latitude: 52.01 + (index % 40) * 0.01,
      longitude: 20.71 + (index % 50) * 0.01,
      country: 'PL',
      distanceKm: 0,
      reachKm: index < 50 ? 150 : 1,
      visibilityLevel: index < 50 ? 'REGIONAL' : 'NEARBY'
    }));
    cacheGetMany.mockImplementationOnce((_namespace: string, keys: string[]) =>
      Promise.resolve(new Map(keys.map((key, index) => [key, index === 0 ? cachedEvents : []])))
    );

    const result = await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10, 0));
    expect(result.events).toHaveLength(600);
    expect(result.clusters).toEqual([]);
    expect(result.representedCount).toBe(600);
  });

  it('counts every eligible event in custom bounds and caches the anonymous result', async () => {
    totalCountResult = 37;
    const result = await handler.execute(
      new GetMapEventsQuery(20.5, 51.8, 21.5, 52.7, 5, 0, undefined, 20.8, 52.1, 21.2, 52.36)
    );

    expect(result.totalCount).toBe(37);
    expect(cacheGetOrSet).toHaveBeenCalledTimes(1);
    const countStatement = capturedStatements.find((statement) =>
      new PgDialect().sqlToQuery(statement).sql.toLowerCase().includes('count(*)::int')
    );
    if (!countStatement) throw new Error('MAP_COUNT_SQL_NOT_CAPTURED');
    const compiled = new PgDialect().sqlToQuery(countStatement);
    expect(compiled.sql.toLowerCase()).toContain('st_intersects(l.geom');
    expect(compiled.sql.toLowerCase()).not.toContain('radius_km');
    expect(compiled.params).toEqual(expect.arrayContaining([20.8, 52.1, 21.2, 52.36]));
  });

  it('rejects inverted viewport bounds', async () => {
    await expect(handler.execute(new GetMapEventsQuery(22, 53, 20, 51, 10, 0))).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects an incomplete set of count bounds', async () => {
    await expect(handler.execute(new GetMapEventsQuery(20, 51, 22, 53, 10, 0, undefined, 20.5))).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects a viewport whose zoom would materialize too many sectors', async () => {
    await expect(handler.execute(new GetMapEventsQuery(-180, -85, 180, 85, 20, 0))).rejects.toMatchObject({
      response: { message: 'MAP_VIEWPORT_TOO_LARGE' }
    });
    expect(cacheGetMany).not.toHaveBeenCalled();
  });
});
