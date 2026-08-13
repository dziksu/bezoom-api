import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwksUrl: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}

export default registerAs('auth', (): AuthConfig => ({
  jwksUrl: process.env.KEYCLOAK_JWKS_URL || 'http://localhost:8080/realms/bezoom/protocol/openid-connect/certs',
  issuer: process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/bezoom',
  clientId: process.env.KEYCLOAK_CLIENT_ID || 'bezoom-api',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  audience: process.env.KEYCLOAK_AUDIENCE || 'bezoom-api'
}));
