import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import type { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { EventReadService } from './event-read.service';

describe('EventReadService', () => {
  const execute = jest.fn();
  const readService = { db: { execute } } as unknown as DrizzleReadService;
  const objectStorage = {} as ObjectStorageService;
  const service = new EventReadService(readService, objectStorage);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads exact account event statistics in one database query', async () => {
    execute.mockResolvedValue({ rows: [{ created: 73, attending: '12', saved: 8 }] });

    await expect(service.getMyStats('user-sub')).resolves.toEqual({
      created: 73,
      attending: 12,
      saved: 8
    });
    expect(execute).toHaveBeenCalledTimes(1);

    const statement = execute.mock.calls[0][0] as SQL;
    const normalizedSql = new PgDialect().sqlToQuery(statement).sql.replace(/\s+/g, ' ').toLowerCase();
    expect(normalizedSql).toContain('select count(*)::int');
    expect(normalizedSql).toContain("participant.status <> 'declined'");
    expect(normalizedSql).toContain("attending_event.status = 'published'");
    expect(normalizedSql).toContain("saved_event_details.status = 'published'");
    expect(normalizedSql).toContain('not exists');
    expect(normalizedSql).not.toContain(' limit ');
  });

  it('returns zeroes when the database returns no row', async () => {
    execute.mockResolvedValue({ rows: [] });

    await expect(service.getMyStats('user-sub')).resolves.toEqual({
      created: 0,
      attending: 0,
      saved: 0
    });
  });

  it('loads the event viewer state in one indexed query', async () => {
    execute.mockResolvedValue({
      rows: [{ liked: true, saved: false, rsvp_status: 'CONFIRMED' }]
    });

    await expect(service.getViewerState('event-id', 'user-sub')).resolves.toEqual({
      liked: true,
      saved: false,
      rsvpStatus: 'CONFIRMED'
    });
    expect(execute).toHaveBeenCalledTimes(1);

    const statement = execute.mock.calls[0][0] as SQL;
    const normalizedSql = new PgDialect().sqlToQuery(statement).sql.replace(/\s+/g, ' ').toLowerCase();
    expect(normalizedSql).toContain('exists ( select 1 from "event_likes" event_like');
    expect(normalizedSql).toContain('exists ( select 1 from "event_saves" event_save');
    expect(normalizedSql).toContain('from "event_participants" participant');
    expect(normalizedSql).toContain("visible_event.status = 'published'");
  });

  it('returns null viewer state when the event is unavailable', async () => {
    execute.mockResolvedValue({ rows: [] });

    await expect(service.getViewerState('event-id', 'user-sub')).resolves.toBeNull();
  });
});
