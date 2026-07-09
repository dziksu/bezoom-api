import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import databaseConfig from './shared/infrastructure/config/database.config';
import redisConfig from './shared/infrastructure/config/redis.config';
import minioConfig from './shared/infrastructure/config/minio.config';
import authConfig from './shared/infrastructure/config/auth.config';
import throttleConfig from './shared/infrastructure/config/throttle.config';
import { DrizzleModule } from './shared/infrastructure/drizzle.module';
import { StorageModule } from './shared/infrastructure/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { AuthGuard, KeycloakConnectModule, RoleGuard } from 'nest-keycloak-connect';
import { APP_GUARD } from '@nestjs/core';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, minioConfig, authConfig, throttleConfig],
      envFilePath: ['.env.local', '.env']
    }),
    KeycloakConnectModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        authServerUrl: config.get<string>('KEYCLOAK_URL') || '',
        realm: config.get<string>('KEYCLOAK_REALM') || '',
        clientId: config.get<string>('KEYCLOAK_CLIENT_ID') || '',
        secret: config.get<string>('KEYCLOAK_CLIENT_SECRET') || '',
        useNestLogger: true
      })
    }),
    DrizzleModule,
    StorageModule,
    HealthModule,
    UserModule
  ],
  controllers: [],
  providers: [
    // 1. Globally enforces authentication across all endpoints
    {
      provide: APP_GUARD,
      useClass: AuthGuard
    },
    // 2. Enables role-based access control checking
    {
      provide: APP_GUARD,
      useClass: RoleGuard
    }
  ]
})
export class AppModule {}
