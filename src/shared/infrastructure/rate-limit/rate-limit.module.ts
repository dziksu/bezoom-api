import { Global, Module } from '@nestjs/common';
import { RedisRateLimitGuard } from './redis-rate-limit.guard';
import { RedisRateLimitService } from './redis-rate-limit.service';

@Global()
@Module({
  providers: [RedisRateLimitService, RedisRateLimitGuard],
  exports: [RedisRateLimitService, RedisRateLimitGuard]
})
export class RateLimitModule {}
