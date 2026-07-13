import { ICurrentUser } from './current-user.interface';

export const IDENTITY_CONTEXT = Symbol('IDENTITY_CONTEXT');

export interface IdentityContextPort {
  getCurrentUser(): ICurrentUser | undefined;
}
