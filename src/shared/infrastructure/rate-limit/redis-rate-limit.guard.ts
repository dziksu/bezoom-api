import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { ICurrentUser } from '@api/shared/domain/auth';
import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from './rate-limit.constants';
import { RedisRateLimitService } from './redis-rate-limit.service';

interface RateLimitedRequest extends Request {
  currentUser?: ICurrentUser;
}

@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RedisRateLimitService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policies = this.reflector.getAllAndOverride<RateLimitPolicy[]>(RATE_LIMIT_POLICIES, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!policies?.length) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitedRequest>();
    const response = http.getResponse<Response>();

    for (const policy of policies) {
      try {
        const decision = await this.limiter.consume(policy, this.identities(policy, request));
        if (!decision.allowed) {
          response.setHeader('Retry-After', String(decision.retryAfterSeconds));
          throw new HttpException(
            {
              code: 'RATE_LIMIT_EXCEEDED',
              details: { retryAfterSeconds: decision.retryAfterSeconds }
            },
            HttpStatus.TOO_MANY_REQUESTS
          );
        }
      } catch (error) {
        if (error instanceof HttpException) throw error;
        // Cost-amplifying endpoints must not become unlimited during a Redis outage.
        throw new ServiceUnavailableException('RATE_LIMIT_UNAVAILABLE');
      }
    }

    return true;
  }

  private identities(policy: RateLimitPolicy, request: RateLimitedRequest): string[] {
    return policy.scopes.map((scope) => {
      if (scope === 'user') {
        if (!request.currentUser?.id) throw new UnauthorizedException('AUTHENTICATION_REQUIRED');
        return `user:${request.currentUser.id}`;
      }

      const ip = request.ip || request.socket?.remoteAddress;
      if (!ip) throw new ServiceUnavailableException('RATE_LIMIT_IDENTITY_UNAVAILABLE');
      return `ip:${ip}`;
    });
  }
}
