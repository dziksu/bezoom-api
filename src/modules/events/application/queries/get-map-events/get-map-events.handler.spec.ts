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
          total_count: '503',
          represented_count: '503',
          events: [],
          clusters: [
            {
              id: 'cluster-a',
              latitude: 52.2,
              longitude: 21.1,
              count: '503',
              west: 20.9,
              south: 52.1,
              east: 21.2,
              north: 52.4
            }
          ]
        }
      ]
    });
  });
  const readService = { db: { execute } } as unknown as DrizzleReadService;
  const writeService = { db: { execute } } as unknown as DrizzleWriteService;
  const objectStorage = {} as ObjectStorageService;
  const cache = {
    getOrSet: jest.fn((_namespace: string, _key: string, _ttl: number, loader: () => Promise<unknown>) => loader())
  } as unknown as RedisCacheService;
  const handler = new GetMapEventsHandler(readService, writeService, objectStorage, cache);

  beforeEach(() => {
    jest.clearAllMocks();
    capturedStatement = undefined;
  });

  it('represents every viewport event as a reach-qualified pin or a cluster member without a hard pin limit', async () => {
    const result = await handler.execute(new GetMapEventsQuery(20.7, 52, 21.3, 52.5, 10, 0));

    if (!capturedStatement) throw new Error('MAP_SQL_NOT_CAPTURED');
    const compiled = new PgDialect().sqlToQuery(capturedStatement);
    const normalizedSql = compiled.sql.replace(/\s+/g, ' ').toLowerCase();

    expect(normalizedSql).toContain('join locations l on l.geog &&');
    expect(normalizedSql).toContain('st_intersects(l.geog');
    expect(normalizedSql).toContain('where radius_km >=');
    expect(normalizedSql).toContain('where c.radius_km <');
    expect(normalizedSql).not.toContain(' limit ');
    expect(normalizedSql).not.toContain('row_number()');
    expect(result).toMatchObject({
      totalCount: 503,
      representedCount: 503,
      individualReachKm: 25,
      events: [],
      clusters: [{ count: 503 }]
    });
  });

  it('uses national reach for a country-level zoom', async () => {
    const result = await handler.execute(new GetMapEventsQuery(14.1, 49, 24.2, 54.9, 5, undefined));
    expect(result.individualReachKm).toBe(1_000);
  });

  it('rejects inverted viewport bounds', async () => {
    await expect(handler.execute(new GetMapEventsQuery(22, 53, 20, 51, 10, 0))).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
