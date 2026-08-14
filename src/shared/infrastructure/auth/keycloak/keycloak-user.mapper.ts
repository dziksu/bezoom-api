import { ICurrentUser, AppPermission, AppRole } from '@api/shared/domain/auth';

interface DecodedKeycloakToken {
  sub?: unknown;
  email?: unknown;
  preferred_username?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  auth_time?: unknown;
  iat?: unknown;
  email_verified?: unknown;
  realm_access?: { roles?: unknown };
  resource_access?: Record<string, { roles?: unknown }>;
}

export const DEFAULT_API_CLIENT_ID = 'bezoom-api';

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function mapKeycloakUser(token: unknown, apiClientId = DEFAULT_API_CLIENT_ID): ICurrentUser {
  const decoded = (token ?? {}) as DecodedKeycloakToken;
  const realmRoles = stringArray(decoded.realm_access?.roles);
  const clientRoles = stringArray(decoded.resource_access?.[apiClientId]?.roles);

  return {
    id: typeof decoded.sub === 'string' ? decoded.sub : '',
    email: typeof decoded.email === 'string' ? decoded.email : undefined,
    username: typeof decoded.preferred_username === 'string' ? decoded.preferred_username : undefined,
    firstName: typeof decoded.given_name === 'string' ? decoded.given_name : undefined,
    lastName: typeof decoded.family_name === 'string' ? decoded.family_name : undefined,
    authTime: typeof decoded.auth_time === 'number' ? decoded.auth_time : undefined,
    issuedAt: typeof decoded.iat === 'number' ? decoded.iat : undefined,
    emailVerified: typeof decoded.email_verified === 'boolean' ? decoded.email_verified : undefined,
    roles: realmRoles.filter((role): role is AppRole => Object.values(AppRole).includes(role as AppRole)),
    permissions: clientRoles.filter((role): role is AppPermission =>
      Object.values(AppPermission).includes(role as AppPermission)
    )
  };
}
