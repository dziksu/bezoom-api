import { EventStatsProjectionService } from './event-stats-projection.service';
import type { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import type { ConfigService } from '@nestjs/config';
import type { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';

const config = {
  get: jest.fn((key: string) => (key === 'runtime' ? { processRole: 'all', outboxRetentionDays: 7 } : undefined))
} as unknown as ConfigService;

describe('EventStatsProjectionService', () => {
  it('returns the number of atomically projected outbox entries', async () => {
    const execute = jest.fn().mockResolvedValue({
      rows: [{ aggregate_id: 'event-1' }, { aggregate_id: 'event-1' }]
    });
    const transaction = jest.fn(async (callback: (tx: { execute: typeof execute }) => Promise<number>) =>
      callback({ execute })
    );
    const writeService = { db: { transaction } } as unknown as DrizzleWriteService;
    const deleteCache = jest.fn().mockResolvedValue(undefined);
    const cache = { delete: deleteCache } as unknown as RedisCacheService;
    const service = new EventStatsProjectionService(writeService, cache, config);

    await expect(service.projectNextBatch()).resolves.toBe(2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledTimes(1);
    const statement = execute.mock.calls[0][0] as { queryChunks: unknown[] };
    const serializedStatement = JSON.stringify(statement);
    expect(serializedStatement).toContain('earlier.processed_at');
    expect(serializedStatement).toContain('pg_try_advisory_xact_lock');
  });

  it('stops scheduling and drains the active projection before database shutdown', async () => {
    let resolveExecute!: (value: { rows: never[] }) => void;
    const execute = jest.fn(
      () =>
        new Promise<{ rows: never[] }>((resolve) => {
          resolveExecute = resolve;
        })
    );
    const transaction = jest.fn(async (callback: (tx: { execute: typeof execute }) => Promise<number>) =>
      callback({ execute })
    );
    const cleanup = jest.fn().mockResolvedValue({ rows: [] });
    const writeService = { db: { transaction, execute: cleanup } } as unknown as DrizzleWriteService;
    const cache = { delete: jest.fn().mockResolvedValue(undefined) } as unknown as RedisCacheService;
    const service = new EventStatsProjectionService(writeService, cache, config);

    service.onApplicationBootstrap();
    expect(execute).toHaveBeenCalledTimes(1);

    let shutdownCompleted = false;
    const shutdown = service.onModuleDestroy().then(() => {
      shutdownCompleted = true;
    });
    await Promise.resolve();
    expect(shutdownCompleted).toBe(false);

    resolveExecute({ rows: [] });
    await shutdown;

    expect(shutdownCompleted).toBe(true);
  });
});
