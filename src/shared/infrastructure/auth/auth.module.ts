import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard as KeycloakAuthGuard, KeycloakConnectModule } from 'nest-keycloak-connect';
import { AppAuthGuard } from './guards/app-auth.guard';
import { AuthorizationGuard } from './guards/authorization.guard';

@Global()
@Module({
  imports: [
    KeycloakConnectModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        authServerUrl: config.get<string>('KEYCLOAK_URL') || '',
        realm: config.get<string>('KEYCLOAK_REALM') || '',
        clientId: config.get<string>('KEYCLOAK_CLIENT_ID') || '',
        secret: config.get<string>('KEYCLOAK_CLIENT_SECRET') || '',
        useNestLogger: true
      })
    })
  ],
  providers: [
    KeycloakAuthGuard,
    AppAuthGuard,
    AuthorizationGuard,
    { provide: APP_GUARD, useExisting: AppAuthGuard },
    { provide: APP_GUARD, useExisting: AuthorizationGuard }
  ],
  exports: [AppAuthGuard, AuthorizationGuard]
})
export class AuthModule {}
