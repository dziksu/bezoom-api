import type { ConfigService } from '@nestjs/config';
import type { MetricsService } from '../observability/metrics.service';

const get = jest.fn<Promise<string | null>, [string]>();
const set = jest.fn<Promise<'OK'>, [string, string, string, number]>().mockResolvedValue('OK');
const del = jest.fn<Promise<number>, [string]>().mockResolvedValue(1);
const connect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
const disconnect = jest.fn<void, []>();
const on = jest.fn();

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    status: 'ready',
    get,
    set,
    del,
    connect,
    disconnect,
    on
  }))
}));

import { RedisCacheService } from './redis-cache.service';

describe('RedisCacheService', () => {
  const metrics = { observeCacheOperation: jest.fn() } as unknown as MetricsService;
  const config = { get: jest.fn().mockReturnValue('redis://localhost') } as unknown as ConfigService;

  beforeEach(() => jest.clearAllMocks());

  it('returns a cache hit without calling the loader', async () => {
    get.mockResolvedValueOnce(JSON.stringify({ id: 'event-id' }));
    const cache = new RedisCacheService(config, metrics);
    const loader = jest.fn<Promise<{ id: string }>, []>();

    await expect(cache.getOrSet('event_detail', 'event-id', 30, loader)).resolves.toEqual({ id: 'event-id' });
    expect(loader).not.toHaveBeenCalled();
  });

  it('loads once, caches and coalesces concurrent misses', async () => {
    get.mockResolvedValue(null);
    const cache = new RedisCacheService(config, metrics);
    const loader = jest.fn<Promise<{ id: string }>, []>().mockResolvedValue({ id: 'event-id' });

    const [first, second] = await Promise.all([
      cache.getOrSet('event_detail', 'event-id', 30, loader),
      cache.getOrSet('event_detail', 'event-id', 30, loader)
    ]);

    expect(first).toEqual(second);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('fails open when Redis is unavailable', async () => {
    get.mockRejectedValueOnce(new Error('unavailable'));
    const cache = new RedisCacheService(config, metrics);

    await expect(cache.getOrSet('event_detail', 'event-id', 30, () => Promise.resolve('database'))).resolves.toBe(
      'database'
    );
  });
});
