import { HttpStatus, ServiceUnavailableException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { RedisRateLimitService } from './redis-rate-limit.service';
import { RedisRateLimitGuard } from './redis-rate-limit.guard';

describe('RedisRateLimitGuard', () => {
  const policy = { name: 'phone_otp_request_user', limit: 5, windowSeconds: 3600, scopes: ['user'] as const };

  function setup(decision?: { allowed: boolean; remaining: number; retryAfterSeconds: number }) {
    const request = {
      currentUser: { id: 'user-sub' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' }
    };
    const response = { setHeader: jest.fn() };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([{ ...policy, scopes: [...policy.scopes] }])
    } as unknown as Reflector;
    const consume = jest.fn().mockResolvedValue(decision ?? { allowed: true, remaining: 4, retryAfterSeconds: 3600 });
    const limiter = { consume } as unknown as RedisRateLimitService;
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response })
    } as unknown as ExecutionContext;

    return { guard: new RedisRateLimitGuard(reflector, limiter), context, consume, response };
  }

  it('allows a request within the shared limit', async () => {
    const { guard, context, consume } = setup();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({ name: policy.name }), ['user:user-sub']);
  });

  it('returns a keyed 429 and Retry-After when the limit is exceeded', async () => {
    const { guard, context, response } = setup({ allowed: false, remaining: 0, retryAfterSeconds: 57 });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: 'RATE_LIMIT_EXCEEDED', details: { retryAfterSeconds: 57 } }
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '57');
  });

  it('fails closed with a stable key when Redis is unavailable', async () => {
    const { guard, context, consume } = setup();
    consume.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(guard.canActivate(context)).rejects.toEqual(new ServiceUnavailableException('RATE_LIMIT_UNAVAILABLE'));
  });
});
