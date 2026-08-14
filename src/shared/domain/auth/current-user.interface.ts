import { AppPermission } from './permission.enum';
import { AppRole } from './role.enum';

export interface ICurrentUser {
  id: string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  authTime?: number;
  issuedAt?: number;
  emailVerified?: boolean;
  roles: AppRole[];
  permissions: AppPermission[];
}
