import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './shared/infrastructure/config/database.config';
import redisConfig from './shared/infrastructure/config/redis.config';
import minioConfig from './shared/infrastructure/config/minio.config';
import authConfig from './shared/infrastructure/config/auth.config';
import throttleConfig from './shared/infrastructure/config/throttle.config';
import eventPipelineConfig from './shared/infrastructure/config/event-pipeline.config';
import phoneDeliveryConfig from './shared/infrastructure/config/phone-delivery.config';
import { DrizzleModule } from './shared/infrastructure/drizzle.module';
import { StorageModule } from './shared/infrastructure/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from '@api/shared/infrastructure/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { EventsModule } from './modules/events/events.module';
import { ObservabilityModule } from './shared/infrastructure/observability/observability.module';
import { CacheModule } from './shared/infrastructure/cache/cache.module';
import { BullConfigModule } from './shared/infrastructure/queue/bull.module';
import { RateLimitModule } from './shared/infrastructure/rate-limit/rate-limit.module';
import { SafetyModule } from './modules/safety/safety.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        redisConfig,
        minioConfig,
        authConfig,
        throttleConfig,
        eventPipelineConfig,
        phoneDeliveryConfig
      ],
      envFilePath: ['.env.local', '.env']
    }),
    ObservabilityModule,
    CacheModule,
    RateLimitModule,
    BullConfigModule,
    AuthModule,
    DrizzleModule,
    StorageModule,
    HealthModule,
    UserModule,
    SafetyModule,
    EventsModule
  ],
  controllers: []
})
export class AppModule {}
