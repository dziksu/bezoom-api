import { AppPermission } from './permission.enum';
import { AppRole } from './role.enum';

export interface ICurrentUser {
  id: string;
  email?: string;
  username?: string;
  roles: AppRole[];
  permissions: AppPermission[];
}
