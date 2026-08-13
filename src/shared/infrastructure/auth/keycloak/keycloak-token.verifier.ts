import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function isApiAccessToken(payload: Record<string, unknown>, audience: string): boolean {
  const tokenAudiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  return payload.typ === 'Bearer' && tokenAudiences.includes(audience);
}

@Injectable()
export class KeycloakTokenVerifier {
  private verifyToken?: Promise<(token: string) => Promise<unknown>>;
  private readonly jwksUrl: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: ConfigService) {
    const jwksUrl = config.get<string>('auth.jwksUrl');
    const issuer = config.get<string>('auth.issuer');
    const audience = config.get<string>('auth.audience');
    if (!jwksUrl || !issuer || !audience) throw new Error('AUTH_CONFIGURATION_INVALID');
    this.jwksUrl = jwksUrl;
    this.issuer = issuer;
    this.audience = audience;
  }

  async verify(token: string): Promise<unknown> {
    try {
      this.verifyToken ??= this.buildVerifier(this.jwksUrl, this.issuer, this.audience);
      return await (
        await this.verifyToken
      )(token);
    } catch {
      // Do not expose JOSE diagnostics or any part of the bearer token.
      throw new UnauthorizedException('AUTHENTICATION_REQUIRED');
    }
  }

  private async buildVerifier(
    jwksUrl: string,
    issuer: string,
    audience: string
  ): Promise<(token: string) => Promise<unknown>> {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const jwks = createRemoteJWKSet(new URL(jwksUrl), {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30_000,
      timeoutDuration: 3_000
    });

    return async (token: string): Promise<unknown> => {
      const result = await jwtVerify(token, jwks, {
        issuer,
        algorithms: ['RS256']
      });
      if (!isApiAccessToken(result.payload, audience)) {
        throw new Error('TOKEN_AUDIENCE_INVALID');
      }
      return result.payload;
    };
  }
}
