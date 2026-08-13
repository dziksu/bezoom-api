import { AppPermission, AppRole } from '@api/shared/domain/auth';
import { mapKeycloakUser } from './keycloak-user.mapper';

describe('mapKeycloakUser', () => {
  it('maps roles from the bezoom-api client by default', () => {
    const user = mapKeycloakUser({
      sub: 'user-1',
      realm_access: { roles: [AppRole.USER] },
      resource_access: { 'bezoom-api': { roles: [AppPermission.MANAGE_USERS] } }
    });

    expect(user).toEqual({
      id: 'user-1',
      email: undefined,
      username: undefined,
      roles: [AppRole.USER],
      permissions: [AppPermission.MANAGE_USERS]
    });
  });

  it('supports a configured Keycloak client id', () => {
    const user = mapKeycloakUser({ resource_access: { custom: { roles: [AppPermission.READ_USERS] } } }, 'custom');

    expect(user.permissions).toEqual([AppPermission.READ_USERS]);
  });

  it('drops unknown roles and malformed claims', () => {
    const user = mapKeycloakUser({
      realm_access: { roles: ['unknown'] },
      resource_access: { 'bezoom-api': { roles: ['unknown'] } }
    });

    expect(user.roles).toEqual([]);
    expect(user.permissions).toEqual([]);
  });
});
