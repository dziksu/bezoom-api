import { SetMetadata } from '@nestjs/common';
import { AppPermission, AppRole } from '@api/shared/domain/auth';

export const REQUIRED_ROLES = 'auth:required-roles';
export const REQUIRED_PERMISSIONS = 'auth:required-permissions';

export const RequireRoles = (...roles: AppRole[]) => SetMetadata(REQUIRED_ROLES, roles);
export const RequirePermissions = (...permissions: AppPermission[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
