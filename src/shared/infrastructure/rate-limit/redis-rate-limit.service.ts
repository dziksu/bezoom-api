import { createHash } from 'node:crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { RateLimitDecision, RateLimitPolicy } from './rate-limit.constants';

const CONSUME_SCRIPT = `
local window_ms = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local max_count = 0
local max_ttl = 0

for _, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  local ttl = redis.call('PTTL', key)
  if count == 1 or ttl < 0 then
    redis.call('PEXPIRE', key, window_ms)
    ttl = window_ms
  end
  if count > max_count then max_count = count end
  if ttl > max_ttl then max_ttl = ttl end
end

return {max_count, max_ttl}
`;

/**
 * Distributed fixed-window limiter. Redis executes consumption for all supplied
 * identities atomically, so every API replica observes the same counters.
 */
@Injectable()
export class RedisRateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('redis.url', 'redis://:redis_dev@localhost:6379'), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      retryStrategy: (attempt) => Math.min(attempt * 250, 2_000)
    });
    this.redis.on('error', () => undefined);
  }

  async consume(policy: RateLimitPolicy, identities: string[]): Promise<RateLimitDecision> {
    this.assertPolicy(policy, identities);
    await this.ensureConnected();

    const keys = identities.map((identity) => this.key(policy.name, identity));
    const result = await this.redis.eval(
      CONSUME_SCRIPT,
      keys.length,
      ...keys,
      String(policy.windowSeconds * 1_000),
      String(policy.limit)
    );
    const [rawCount, rawTtl] = result as [number | string, number | string];
    const count = Number(rawCount);
    const ttlMs = Math.max(0, Number(rawTtl));

    return {
      allowed: count <= policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1_000))
    };
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      await this.redis.connect();
    }
  }

  private key(operation: string, identity: string): string {
    const digest = createHash('sha256').update(identity, 'utf8').digest('hex');
    return `bezoom:rate:${operation}:${digest}`;
  }

  private assertPolicy(policy: RateLimitPolicy, identities: string[]): void {
    if (
      !/^[a-z0-9_-]{1,64}$/.test(policy.name) ||
      !Number.isInteger(policy.limit) ||
      policy.limit < 1 ||
      !Number.isInteger(policy.windowSeconds) ||
      policy.windowSeconds < 1 ||
      identities.length < 1
    ) {
      throw new Error('RATE_LIMIT_CONFIGURATION_INVALID');
    }
  }
}
