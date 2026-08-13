import type { ConfigService } from '@nestjs/config';

const evalRedis = jest.fn<Promise<[number, number]>, unknown[]>();
const connect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
const disconnect = jest.fn<void, []>();
const on = jest.fn();

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    status: 'ready',
    eval: evalRedis,
    connect,
    disconnect,
    on
  }))
}));

import { RedisRateLimitService } from './redis-rate-limit.service';

describe('RedisRateLimitService', () => {
  const config = { get: jest.fn().mockReturnValue('redis://localhost') } as unknown as ConfigService;
  const policy = { name: 'event_create_user', limit: 10, windowSeconds: 60, scopes: ['user'] as const };

  beforeEach(() => jest.clearAllMocks());

  it('uses a hashed identity and returns the shared Redis decision', async () => {
    evalRedis.mockResolvedValueOnce([3, 42_500]);
    const service = new RedisRateLimitService(config);

    await expect(service.consume({ ...policy, scopes: [...policy.scopes] }, ['user:sensitive-sub'])).resolves.toEqual({
      allowed: true,
      remaining: 7,
      retryAfterSeconds: 43
    });

    const serializedCall = JSON.stringify(evalRedis.mock.calls[0]);
    expect(serializedCall).toContain('bezoom:rate:event_create_user:');
    expect(serializedCall).not.toContain('sensitive-sub');
  });

  it('rejects a request after the distributed limit is exceeded', async () => {
    evalRedis.mockResolvedValueOnce([11, 20_001]);
    const service = new RedisRateLimitService(config);

    await expect(service.consume({ ...policy, scopes: [...policy.scopes] }, ['user:1'])).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 21
    });
  });
});
