import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ICurrentUser } from '@api/shared/domain/auth';
import { mapKeycloakUser } from '../keycloak/keycloak-user.mapper';
import { KeycloakTokenVerifier } from '../keycloak/keycloak-token.verifier';
import { PUBLIC_ROUTE } from '../decorators/public.decorator';

interface AuthenticatedRequest {
  headers?: { authorization?: string | string[] };
  currentUser?: ICurrentUser;
}

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private readonly tokenVerifier: KeycloakTokenVerifier,
    private readonly reflector: Reflector,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getClass(),
      context.getHandler()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.bearerToken(request.headers?.authorization);
    if (!token) throw new UnauthorizedException('AUTHENTICATION_REQUIRED');

    const payload = await this.tokenVerifier.verify(token);
    request.currentUser = mapKeycloakUser(payload, this.config.get<string>('auth.clientId', 'bezoom-api'));
    if (!request.currentUser.id) throw new UnauthorizedException('AUTHENTICATION_REQUIRED');
    return true;
  }

  private bearerToken(header: string | string[] | undefined): string | undefined {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) return undefined;
    const match = /^Bearer ([^\s]+)$/i.exec(value);
    return match?.[1];
  }
}
