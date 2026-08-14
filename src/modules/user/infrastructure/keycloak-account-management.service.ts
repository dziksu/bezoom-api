import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccountLifecycleConfig } from '@api/shared/infrastructure/config/account-lifecycle.config';

interface AccessTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

@Injectable()
export class KeycloakAccountManagementService {
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  accountConsoleUrl(): string {
    const settings = this.settings();
    const base = settings.keycloakPublicUrl.replace(/\/$/, '');
    const query = new URLSearchParams({
      referrer: settings.accountConsoleClientId,
      referrer_uri: settings.accountReturnUrl
    });
    return `${base}/realms/${encodeURIComponent(settings.realm)}/account?${query.toString()}`;
  }

  async logoutUser(keycloakUserId: string): Promise<void> {
    await this.adminRequest(keycloakUserId, 'logout', 'POST');
  }

  async deleteUser(keycloakUserId: string): Promise<void> {
    await this.adminRequest(keycloakUserId, undefined, 'DELETE');
  }

  private async adminRequest(keycloakUserId: string, action: string | undefined, method: 'POST' | 'DELETE') {
    const settings = this.settings();
    const suffix = action ? `/${action}` : '';
    const url = `${settings.keycloakInternalUrl.replace(/\/$/, '')}/admin/realms/${encodeURIComponent(settings.realm)}/users/${encodeURIComponent(keycloakUserId)}${suffix}`;
    try {
      const response = await fetch(url, {
        method,
        headers: { authorization: `Bearer ${await this.adminAccessToken()}` },
        signal: AbortSignal.timeout(3_000)
      });
      if (response.status === 204 || response.status === 404) return;
      throw new Error(`KEYCLOAK_ADMIN_HTTP_${response.status}`);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('IDENTITY_PROVIDER_UNAVAILABLE');
    }
  }

  private async adminAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 5_000) return this.accessToken.value;
    const settings = this.settings();
    if (!settings.managementClientSecret) {
      throw new ServiceUnavailableException('ACCOUNT_IDENTITY_MANAGEMENT_NOT_CONFIGURED');
    }

    const url = `${settings.keycloakInternalUrl.replace(/\/$/, '')}/realms/${encodeURIComponent(settings.realm)}/protocol/openid-connect/token`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: settings.managementClientId,
          client_secret: settings.managementClientSecret
        }),
        signal: AbortSignal.timeout(3_000)
      });
      if (!response.ok) throw new Error(`KEYCLOAK_TOKEN_HTTP_${response.status}`);
      const payload = (await response.json()) as AccessTokenResponse;
      if (typeof payload.access_token !== 'string') throw new Error('KEYCLOAK_TOKEN_INVALID');
      const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 60;
      this.accessToken = { value: payload.access_token, expiresAt: Date.now() + expiresIn * 1_000 };
      return payload.access_token;
    } catch {
      throw new ServiceUnavailableException('IDENTITY_PROVIDER_UNAVAILABLE');
    }
  }

  private settings(): AccountLifecycleConfig {
    const settings = this.config.get<AccountLifecycleConfig>('accountLifecycle');
    if (!settings) throw new ServiceUnavailableException('ACCOUNT_LIFECYCLE_NOT_CONFIGURED');
    return settings;
  }
}
