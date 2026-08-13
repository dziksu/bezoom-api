import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from './rate-limit.constants';
import { RedisRateLimitGuard } from './redis-rate-limit.guard';

export const RedisRateLimit = (...policies: RateLimitPolicy[]) =>
  applyDecorators(SetMetadata(RATE_LIMIT_POLICIES, policies), UseGuards(RedisRateLimitGuard));
