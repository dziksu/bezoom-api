import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { AppAuthGuard } from './app-auth.guard';
import type { KeycloakTokenVerifier } from '../keycloak/keycloak-token.verifier';

describe('AppAuthGuard', () => {
  const tokenPayload = { sub: 'user-sub', email: 'user@example.com' };

  function buildGuard(options?: { publicRoute?: boolean; optionalRoute?: boolean; authorization?: string }) {
    const request: { headers: { authorization?: string }; currentUser?: unknown } = {
      headers: { authorization: options?.authorization }
    };
    const verify = jest.fn<Promise<unknown>, [string]>().mockResolvedValue(tokenPayload);
    const verifier = { verify } as unknown as KeycloakTokenVerifier;
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(options?.publicRoute ?? false)
        .mockReturnValueOnce(options?.optionalRoute ?? false)
    } as unknown as Reflector;
    const config = { get: jest.fn().mockReturnValue('bezoom-api') } as unknown as ConfigService;
    const context = {
      getClass: jest.fn(),
      getHandler: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request })
    } as unknown as ExecutionContext;

    return { guard: new AppAuthGuard(verifier, reflector, config), verify, request, context };
  }

  it('bypasses token verification for a public route', async () => {
    const { guard, verify, context } = buildGuard({ publicRoute: true });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('verifies a bearer token and maps current user', async () => {
    const { guard, verify, request, context } = buildGuard({ authorization: 'Bearer access-token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('access-token');
    expect(request.currentUser).toMatchObject({ id: 'user-sub', email: 'user@example.com' });
  });

  it('allows anonymous optional auth and verifies a supplied optional token', async () => {
    const anonymous = buildGuard({ optionalRoute: true });
    await expect(anonymous.guard.canActivate(anonymous.context)).resolves.toBe(true);
    expect(anonymous.verify).not.toHaveBeenCalled();

    const authenticated = buildGuard({ optionalRoute: true, authorization: 'Bearer access-token' });
    await expect(authenticated.guard.canActivate(authenticated.context)).resolves.toBe(true);
    expect(authenticated.request.currentUser).toMatchObject({ id: 'user-sub' });
  });

  it('rejects a missing or malformed bearer token with a stable key', async () => {
    const { guard, context } = buildGuard({ authorization: 'Basic credentials' });

    await expect(guard.canActivate(context)).rejects.toEqual(new UnauthorizedException('AUTHENTICATION_REQUIRED'));
  });
});
