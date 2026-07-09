import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './shared/infrastructure/config/database.config';
import redisConfig from './shared/infrastructure/config/redis.config';
import minioConfig from './shared/infrastructure/config/minio.config';
import authConfig from './shared/infrastructure/config/auth.config';
import throttleConfig from './shared/infrastructure/config/throttle.config';
import { DrizzleModule } from './shared/infrastructure/drizzle.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, minioConfig, authConfig, throttleConfig],
      envFilePath: ['.env.local', '.env']
    }),
    DrizzleModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}
