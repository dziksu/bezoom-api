import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppPermission, AppRole, ICurrentUser } from '@api/shared/domain/auth';
import { REQUIRED_PERMISSIONS, REQUIRED_ROLES } from '../decorators/authorization.decorators';

interface AuthorizedRequest {
  currentUser?: ICurrentUser;
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(REQUIRED_ROLES, [
      context.getClass(),
      context.getHandler()
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<AppPermission[]>(REQUIRED_PERMISSIONS, [
      context.getClass(),
      context.getHandler()
    ]);

    if (!requiredRoles?.length && !requiredPermissions?.length) {
      return true;
    }

    const user = context.switchToHttp().getRequest<AuthorizedRequest>().currentUser;
    if (!user) {
      throw new UnauthorizedException();
    }

    const hasRoles = !requiredRoles?.length || requiredRoles.every((role) => user.roles.includes(role));
    const hasPermissions =
      !requiredPermissions?.length || requiredPermissions.every((permission) => user.permissions.includes(permission));

    if (!hasRoles || !hasPermissions) {
      throw new ForbiddenException('Insufficient authorization');
    }

    return true;
  }
}
