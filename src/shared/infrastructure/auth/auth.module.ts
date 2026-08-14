import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppAuthGuard } from './guards/app-auth.guard';
import { AuthorizationGuard } from './guards/authorization.guard';
import { KeycloakTokenVerifier } from './keycloak/keycloak-token.verifier';
import { AccountStatusGuard } from './guards/account-status.guard';
import { DrizzleModule } from '../drizzle.module';
import { CacheModule } from '../cache/cache.module';

@Global()
@Module({
  imports: [DrizzleModule, CacheModule],
  providers: [
    KeycloakTokenVerifier,
    AppAuthGuard,
    AuthorizationGuard,
    AccountStatusGuard,
    { provide: APP_GUARD, useExisting: AppAuthGuard },
    { provide: APP_GUARD, useExisting: AccountStatusGuard },
    { provide: APP_GUARD, useExisting: AuthorizationGuard }
  ],
  exports: [AppAuthGuard, AccountStatusGuard, AuthorizationGuard, KeycloakTokenVerifier]
})
export class AuthModule {}
