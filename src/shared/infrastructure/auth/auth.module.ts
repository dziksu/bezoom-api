import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppAuthGuard } from './guards/app-auth.guard';
import { AuthorizationGuard } from './guards/authorization.guard';
import { KeycloakTokenVerifier } from './keycloak/keycloak-token.verifier';

@Global()
@Module({
  providers: [
    KeycloakTokenVerifier,
    AppAuthGuard,
    AuthorizationGuard,
    { provide: APP_GUARD, useExisting: AppAuthGuard },
    { provide: APP_GUARD, useExisting: AuthorizationGuard }
  ],
  exports: [AppAuthGuard, AuthorizationGuard, KeycloakTokenVerifier]
})
export class AuthModule {}
