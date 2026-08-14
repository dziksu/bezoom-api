import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { MetricsService } from '../observability/metrics.service';

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly redis: Redis;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    config: ConfigService,
    private readonly metrics: MetricsService
  ) {
    this.redis = new Redis(config.get<string>('redis.url', 'redis://:redis_dev@localhost:6379'), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      retryStrategy: (attempt) => Math.min(attempt * 250, 2_000)
    });
    this.redis.on('error', () => undefined);
  }

  async getOrSet<T>(namespace: string, key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cacheKey = `bezoom:${namespace}:${key}`;
    const cached = await this.read<T>(namespace, cacheKey);
    if (cached !== undefined) return cached;

    const current = this.inFlight.get(cacheKey) as Promise<T> | undefined;
    if (current) return current;

    const operation = loader().then(async (value) => {
      await this.write(namespace, cacheKey, value, ttlSeconds);
      return value;
    });
    this.inFlight.set(cacheKey, operation);
    try {
      return await operation;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  async delete(namespace: string, key: string): Promise<void> {
    try {
      await this.ensureConnected();
      await this.redis.del(`bezoom:${namespace}:${key}`);
    } catch {
      this.metrics.observeCacheOperation(namespace, 'error');
      this.logger.warn('CACHE_DELETE_FAILED');
    }
  }

  async clearNamespace(namespace: string): Promise<void> {
    try {
      await this.ensureConnected();
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `bezoom:${namespace}:*`, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) await this.redis.unlink(...keys);
      } while (cursor !== '0');
      this.metrics.observeCacheOperation(namespace, 'delete');
    } catch {
      this.metrics.observeCacheOperation(namespace, 'error');
      this.logger.warn('CACHE_NAMESPACE_DELETE_FAILED');
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  private async read<T>(namespace: string, cacheKey: string): Promise<T | undefined> {
    try {
      await this.ensureConnected();
      const value = await this.redis.get(cacheKey);
      if (value === null) {
        this.metrics.observeCacheOperation(namespace, 'miss');
        return undefined;
      }
      this.metrics.observeCacheOperation(namespace, 'hit');
      return JSON.parse(value) as T;
    } catch {
      this.metrics.observeCacheOperation(namespace, 'error');
      return undefined;
    }
  }

  private async write<T>(namespace: string, cacheKey: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.ensureConnected();
      const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(ttlSeconds * 0.1)));
      await this.redis.set(cacheKey, JSON.stringify(value), 'EX', Math.max(1, ttlSeconds + jitter));
      this.metrics.observeCacheOperation(namespace, 'write');
    } catch {
      this.metrics.observeCacheOperation(namespace, 'error');
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}
