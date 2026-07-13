import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard as KeycloakAuthGuard } from 'nest-keycloak-connect';
import { ICurrentUser } from '@api/shared/domain/auth';
import { mapKeycloakUser } from '../keycloak/keycloak-user.mapper';
import { PUBLIC_ROUTE } from '../decorators/public.decorator';

interface AuthenticatedRequest {
  user?: unknown;
  currentUser?: ICurrentUser;
}

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private readonly keycloakAuthGuard: KeycloakAuthGuard,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getClass(),
      context.getHandler()
    ]);
    if (isPublic) {
      return true;
    }

    const activated = await this.keycloakAuthGuard.canActivate(context);
    if (!activated) {
      return false;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.currentUser = mapKeycloakUser(request.user);
    return true;
  }
}
