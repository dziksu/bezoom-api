import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwksUrl: process.env.KEYCLOAK_JWKS_URL || 'http://localhost:8080/realms/bezoom/protocol/openid-connect/certs',
  issuer: process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/bezoom',
  clientId: process.env.KEYCLOAK_CLIENT_ID || '',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  audience: process.env.KEYCLOAK_AUDIENCE || 'bezoom-api'
}));
