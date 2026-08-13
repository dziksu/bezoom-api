export const RATE_LIMIT_POLICIES = 'rate-limit:policies';

export type RateLimitIdentityScope = 'ip' | 'user';

export interface RateLimitPolicy {
  /** Stable, low-cardinality operation name used only in the Redis key. */
  name: string;
  limit: number;
  windowSeconds: number;
  scopes: RateLimitIdentityScope[];
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}
