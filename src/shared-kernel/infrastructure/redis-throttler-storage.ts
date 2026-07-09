import { ThrottlerStorage } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || 'redis_dev'
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = 'throttle:' + key;
    const result = await this.client.multi().incr(redisKey).pexpire(redisKey, ttl).exec();
    const totalHits = Number(result?.[0]?.[1] ?? 1);
    const ttlRemaining = await this.client.pttl(redisKey);
    const timeToExpire = ttlRemaining > 0 ? ttlRemaining : ttl;
    const isBlocked = totalHits > limit;
    let timeToBlockExpire = 0;
    if (isBlocked && blockDuration > 0) {
      await this.client.set('throttle:block:' + key, '1', 'PX', blockDuration);
      timeToBlockExpire = blockDuration;
    }
    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
  }

  async reset(key: string): Promise<void> {
    await this.client.del('throttle:' + key);
  }
}
