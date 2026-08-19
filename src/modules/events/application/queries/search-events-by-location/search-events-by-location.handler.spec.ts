import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import type { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import type { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import type { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { MVP_DISCOVERY_RADIUS_METERS, SearchEventsByLocationHandler } from './search-events-by-location.handler';
import { SearchEventsByLocationQuery } from './search-events-by-location.query';

const searchRow = (id: string, timestampsAsText = false) => ({
  id,
  title: `Event ${id}`,
  description: 'A sufficiently descriptive event description for discovery.',
  category: 'MUSIC_AND_NIGHTLIFE',
  start_date: timestampsAsText ? '2026-09-01 18:00:00+00' : new Date('2026-09-01T18:00:00.000Z'),
  end_date: null,
  organizer_id: 'cd7ee731-259a-46d8-93ea-5580753b3637',
  submitted_by_is_organizer: true,
  price_type: 'FREE',
  price_min: null,
  price_max: null,
  currency: 'PLN',
  ticket_url: null,
  price_notes: null,
  amenities: [],
  status: 'PUBLISHED',
  verification_status: 'VERIFIED',
  created_at: timestampsAsText ? '2026-08-01 10:00:00+00' : new Date('2026-08-01T10:00:00.000Z'),
  latitude: '50.0647000',
  longitude: '19.9450000',
  address: null,
  city: 'Krakow',
  country: 'PL',
  distance_m: 1250
});

describe('SearchEventsByLocationHandler', () => {
  let capturedStatement: SQL | undefined;
  let executeRows: ReturnType<typeof searchRow>[] = [];
  const execute = jest.fn((statement: SQL) => {
    capturedStatement = statement;
    return Promise.resolve({ rows: executeRows });
  });
  const photoOrderBy = jest.fn().mockResolvedValue([]);
  const photoWhere = jest.fn().mockReturnValue({ orderBy: photoOrderBy });
  const photoFrom = jest.fn().mockReturnValue({ where: photoWhere });
  const selectDistinctOn = jest.fn().mockReturnValue({ from: photoFrom });
  const readService = { db: { execute, selectDistinctOn } } as unknown as DrizzleReadService;
  const writeService = { db: { execute } } as unknown as DrizzleWriteService;
  const objectStorage = {
    mediaBucket: 'bezoom-media',
    getPublicUrl: jest.fn((bucket: string, key: string) => `${bucket}/${key}`)
  } as unknown as ObjectStorageService;
  const getOrSet = jest.fn((_namespace: string, _key: string, _ttl: number, loader: () => Promise<unknown>) =>
    loader()
  );
  const cache = { getOrSet } as unknown as RedisCacheService;
  const handler = new SearchEventsByLocationHandler(readService, writeService, objectStorage, cache);

  beforeEach(() => {
    jest.clearAllMocks();
    capturedStatement = undefined;
    executeRows = [];
    photoOrderBy.mockResolvedValue([]);
  });

  it('uses an indexable constant-radius ST_DWithin and avoids an exact count', async () => {
    await handler.execute(new SearchEventsByLocationQuery(50.0647, 19.945, undefined, undefined, 20));

    if (!capturedStatement) throw new Error('SEARCH_SQL_NOT_CAPTURED');
    const compiled = new PgDialect().sqlToQuery(capturedStatement);
    const normalizedSql = compiled.sql.replace(/\s+/g, ' ').toLowerCase();

    expect(normalizedSql).toContain('join locations l on st_dwithin(l.geog, p.origin,');
    expect(normalizedSql).toContain('nearby as materialized');
    expect(normalizedSql).toContain('st_distance(l.geog, p.origin, false)');
    expect(normalizedSql).toContain('st_dwithin(l.geog, p.origin, $');
    expect(normalizedSql).toContain(', false)');
    expect(normalizedSql).toContain('and e.start_date > now()');
    expect(normalizedSql).toContain('and e.radius_km =');
    expect(normalizedSql).toContain('and e.archived_at is null');
    expect(normalizedSql).not.toContain('count(*) over');
    expect(compiled.params).toContain(MVP_DISCOVERY_RADIUS_METERS);
    expect(compiled.params).toContain(21);
  });

  it('fetches one extra row, trims it and exposes a next cursor', async () => {
    executeRows = [searchRow('one'), searchRow('two'), searchRow('three')];

    const result = await handler.execute(new SearchEventsByLocationQuery(50.0647, 19.945, 0, undefined, 2));

    expect(result.items.map((event) => event.id)).toEqual(['one', 'two']);
    expect(result.items[0]).toMatchObject({
      creatorId: 'cd7ee731-259a-46d8-93ea-5580753b3637',
      submittedByIsOrganizer: true
    });
    expect(result.items[0]).not.toHaveProperty('organizerKeycloakSub');
    expect(result.items[0]).not.toHaveProperty('visibility');
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(getOrSet).toHaveBeenCalledWith('event_search', expect.any(String), 15, expect.any(Function));
  });

  it('returns hasMore false for the last batch', async () => {
    executeRows = [searchRow('only')];

    const result = await handler.execute(new SearchEventsByLocationQuery(50.0647, 19.945, undefined, undefined, 20));

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });

  it('normalizes raw PostgreSQL timestamptz text to Date objects', async () => {
    executeRows = [searchRow('text-timestamps', true)];

    const result = await handler.execute(new SearchEventsByLocationQuery(50.0647, 19.945, undefined, undefined, 20));

    expect(result.items[0].startDate).toBeInstanceOf(Date);
    expect(result.items[0].startDate.toISOString()).toBe('2026-09-01T18:00:00.000Z');
    expect(result.items[0].createdAt).toBeInstanceOf(Date);
    expect(result.items[0].createdAt.toISOString()).toBe('2026-08-01T10:00:00.000Z');
  });
});
