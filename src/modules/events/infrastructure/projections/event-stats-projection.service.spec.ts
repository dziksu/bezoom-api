import { EventStatsProjectionService } from './event-stats-projection.service';
import type { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';

describe('EventStatsProjectionService', () => {
  it('returns the number of atomically projected outbox entries', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [{ id: '1' }, { id: '2' }] });
    const transaction = jest.fn(async (callback: (tx: { execute: typeof execute }) => Promise<number>) =>
      callback({ execute })
    );
    const writeService = { db: { transaction } } as unknown as DrizzleWriteService;
    const cache = { delete: jest.fn().mockResolvedValue(undefined) } as never;
    const service = new EventStatsProjectionService(writeService, cache);

    await expect(service.projectNextBatch()).resolves.toBe(2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
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
    const writeService = { db: { transaction } } as unknown as DrizzleWriteService;
    const cache = { delete: jest.fn().mockResolvedValue(undefined) } as never;
    const service = new EventStatsProjectionService(writeService, cache);

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
