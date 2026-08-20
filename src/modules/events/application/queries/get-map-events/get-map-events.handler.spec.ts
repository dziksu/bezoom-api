import { BadRequestException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import type { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import type { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import type { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { GetMapEventsHandler } from './get-map-events.handler';
import { GetMapEventsQuery } from './get-map-events.query';

describe('GetMapEventsHandler', () => {
  let capturedStatements: SQL[] = [];
  let totalCountResult = 0;
  const execute = jest.fn((statement: SQL) => {
    capturedStatements.push(statement);
    const normalizedSql = new PgDialect().sqlToQuery(statement).sql.replace(/\s+/g, ' ').toLowerCase();
    return Promise.resolve({
      rows: normalizedSql.includes('select count(*)::int as count') ? [{ count: totalCountResult }] : [{ events: [] }]
    });
  });
  const readService = { db: { execute } } as unknown as DrizzleReadService;
  const writeService = { db: { execute } } as unknown as DrizzleWriteService;
  const objectStorage = {} as ObjectStorageService;
  const cacheGetMany = jest.fn().mockResolvedValue(new Map());
  const cacheSetMany = jest.fn().mockResolvedValue(undefined);
  const cache = {
    getVersion: jest.fn().mockResolvedValue(1),
    getMany: cacheGetMany,
    setMany: cacheSetMany
  } as unknown as RedisCacheService;
  const handler = new GetMapEventsHandler(readService, writeService, objectStorage, cache);

  beforeEach(() => {
    jest.clearAllMocks();
    capturedStatements = [];
    totalCountResult = 0;
  });

  it('loads missing sectors in one spatial query without clustering or a hard limit', async () => {
    const result = await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10, 0));

    const pinStatement = capturedStatements.find((statement) =>
      new PgDialect().sqlToQuery(statement).sql.toLowerCase().includes('jsonb_agg')
    );
    const countStatement = capturedStatements.find((statement) =>
      new PgDialect().sqlToQuery(statement).sql.toLowerCase().includes('count(*)::int')
    );
    if (!pinStatement || !countStatement) throw new Error('MAP_SQL_NOT_CAPTURED');
    const normalizedPinSql = new PgDialect().sqlToQuery(pinStatement).sql.replace(/\s+/g, ' ').toLowerCase();
    const normalizedCountSql = new PgDialect().sqlToQuery(countStatement).sql.replace(/\s+/g, ' ').toLowerCase();

    expect(normalizedPinSql).toContain('join locations l on l.geog &&');
    expect(normalizedPinSql).toContain('st_intersects(l.geog');
    expect(normalizedPinSql).toContain('and e.radius_km >=');
    expect(normalizedPinSql).not.toContain('cluster_members');
    expect(normalizedPinSql).not.toContain('st_snaptogrid');
    expect(normalizedPinSql).not.toContain(' limit ');
    expect(normalizedPinSql).not.toContain('row_number()');
    expect(normalizedCountSql).toContain('join locations l on l.geog &&');
    expect(normalizedCountSql).not.toContain('radius_km');
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
      expect.arrayContaining([expect.stringMatching(/^reach-v2:v1:\d{4}-\d{2}-\d{2}:ALL:9:/)])
    );
    expect(cacheSetMany).toHaveBeenCalledTimes(1);
  });

  it('includes city, regional and national reach at a country-level zoom', async () => {
    const result = await handler.execute(new GetMapEventsQuery(14.1, 49, 24.2, 54.9, 5, undefined));
    expect(result.individualReachKm).toBe(25);
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
                    description: 'Cached event description',
                    category: 'ENTERTAINMENT',
                    startDate: new Date(Date.now() + 86_400_000).toISOString(),
                    latitude: 52.2,
                    longitude: 21.05,
                    country: 'PL',
                    priceType: 'FREE',
                    currency: 'PLN',
                    amenities: [],
                    photos: [],
                    status: 'PUBLISHED',
                    verificationStatus: 'VERIFIED',
                    submittedByIsOrganizer: false,
                    createdAt: new Date().toISOString(),
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
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.events).toHaveLength(1);
    expect(result.returnedCount).toBe(1);
    expect(result.events[0]).toMatchObject({ id: 'cached-event' });
    expect(typeof result.events[0].distanceKm).toBe('number');
  });

  it('counts every eligible event in the visible bounds without applying the reach threshold', async () => {
    totalCountResult = 37;
    const result = await handler.execute(
      new GetMapEventsQuery(20.5, 51.8, 21.5, 52.7, 5, 0, undefined, 20.8, 52.1, 21.2, 52.36)
    );

    expect(result.totalCount).toBe(37);
    expect(result.returnedCount).toBe(0);
    const countStatement = capturedStatements.find((statement) =>
      new PgDialect().sqlToQuery(statement).sql.toLowerCase().includes('count(*)::int')
    );
    if (!countStatement) throw new Error('MAP_COUNT_SQL_NOT_CAPTURED');
    const compiled = new PgDialect().sqlToQuery(countStatement);
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
});
