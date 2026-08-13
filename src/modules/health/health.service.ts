import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';

export type DependencyName = 'database' | 'object_storage' | 'redis';
export type DependencyStatus = 'down' | 'up';

export interface ReadinessResult {
  ready: boolean;
  checks: Record<DependencyName, DependencyStatus>;
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly timeoutMs: number;

  constructor(
    configService: ConfigService,
    private readonly database: DrizzleReadService,
    private readonly objectStorage: ObjectStorageService
  ) {
    this.timeoutMs = configService.get<number>('HEALTH_CHECK_TIMEOUT_MS', 2_000);
    this.redis = new Redis(configService.get<string>('redis.url', 'redis://:redis_dev@localhost:6379'), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      connectTimeout: this.timeoutMs
    });
    this.redis.on('error', () => undefined);
  }

  async readiness(): Promise<ReadinessResult> {
    const checks = await Promise.all([
      this.check('database', () => this.database.ping()),
      this.check('redis', () => this.pingRedis()),
      this.check('object_storage', () => this.objectStorage.ping())
    ]);
    const statuses = Object.fromEntries(checks) as Record<DependencyName, DependencyStatus>;

    return {
      ready: Object.values(statuses).every((status) => status === 'up'),
      checks: statuses
    };
  }

  onModuleDestroy(): void {
    if (this.redis.status !== 'end') {
      this.redis.disconnect();
    }
  }

  private async pingRedis(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      await this.redis.connect();
    }
    await this.redis.ping();
  }

  private async check(
    name: DependencyName,
    operation: () => Promise<unknown>
  ): Promise<[DependencyName, DependencyStatus]> {
    try {
      await this.withTimeout(operation());
      return [name, 'up'];
    } catch {
      return [name, 'down'];
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('HEALTH_CHECK_TIMEOUT')), this.timeoutMs);
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
