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
  let capturedStatement: SQL | undefined;
  const execute = jest.fn((statement: SQL) => {
    capturedStatement = statement;
    return Promise.resolve({
      rows: [
        {
          events: []
        }
      ]
    });
  });
  const readService = { db: { execute } } as unknown as DrizzleReadService;
  const writeService = { db: { execute } } as unknown as DrizzleWriteService;
  const objectStorage = {} as ObjectStorageService;
  const cache = {
    getVersion: jest.fn().mockResolvedValue(1),
    getMany: jest.fn().mockResolvedValue(new Map()),
    setMany: jest.fn().mockResolvedValue(undefined)
  } as unknown as RedisCacheService;
  const handler = new GetMapEventsHandler(readService, writeService, objectStorage, cache);

  beforeEach(() => {
    jest.clearAllMocks();
    capturedStatement = undefined;
  });

  it('loads missing sectors in one spatial query without clustering or a hard limit', async () => {
    const result = await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10, 0));

    if (!capturedStatement) throw new Error('MAP_SQL_NOT_CAPTURED');
    const compiled = new PgDialect().sqlToQuery(capturedStatement);
    const normalizedSql = compiled.sql.replace(/\s+/g, ' ').toLowerCase();

    expect(normalizedSql).toContain('join locations l on l.geog &&');
    expect(normalizedSql).toContain('st_intersects(l.geog');
    expect(normalizedSql).toContain('and e.radius_km >=');
    expect(normalizedSql).not.toContain('cluster_members');
    expect(normalizedSql).not.toContain('st_snaptogrid');
    expect(normalizedSql).not.toContain(' limit ');
    expect(normalizedSql).not.toContain('row_number()');
    expect(result).toMatchObject({
      totalCount: 0,
      representedCount: 0,
      individualReachKm: 0,
      events: [],
      clusters: []
    });
    expect(cache.getMany).toHaveBeenCalledWith(
      'event_map_sector',
      expect.arrayContaining([expect.stringMatching(/^v1:\d{4}-\d{2}-\d{2}:ALL:9:/)])
    );
    expect(cache.setMany).toHaveBeenCalledTimes(1);
  });

  it('includes city, regional and national reach at a country-level zoom', async () => {
    const result = await handler.execute(new GetMapEventsQuery(14.1, 49, 24.2, 54.9, 5, undefined));
    expect(result.individualReachKm).toBe(25);
  });

  it('includes local reach from a regional-level zoom', async () => {
    const result = await handler.execute(new GetMapEventsQuery(14.1, 49, 24.2, 54.9, 6, undefined));
    expect(result.individualReachKm).toBe(0);
  });

  it('uses the same sector keys for fractional movement within a zoom level', async () => {
    await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10.1, 0));
    const firstKeys = (cache.getMany as jest.Mock).mock.calls.at(-1)?.[1];
    await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10.9, 0));
    const secondKeys = (cache.getMany as jest.Mock).mock.calls.at(-1)?.[1];
    expect(secondKeys).toEqual(firstKeys);
  });

  it('serves a fully cached sector coverage without querying PostGIS', async () => {
    (cache.getMany as jest.Mock).mockImplementationOnce((_namespace: string, keys: string[]) =>
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
    expect(execute).not.toHaveBeenCalled();
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ id: 'cached-event', distanceKm: expect.any(Number) });
  });

  it('rejects inverted viewport bounds', async () => {
    await expect(handler.execute(new GetMapEventsQuery(22, 53, 20, 51, 10, 0))).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
