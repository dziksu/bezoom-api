import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, ne } from 'drizzle-orm';
import type { ICurrentUser } from '@api/shared/domain/auth';
import { accountDeletions, profiles } from '../../database/schema';
import { DrizzleWriteService } from '../../drizzle-write.service';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { ALLOW_INACTIVE_ACCOUNT } from '../decorators/allow-inactive-account.decorator';

type AccountStatus = 'ACTIVE' | 'DEACTIVATED' | 'PENDING_DELETION' | 'ANONYMIZED' | 'MISSING';

interface AccountRequest {
  currentUser?: ICurrentUser;
}

@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly write: DrizzleWriteService,
    private readonly cache: RedisCacheService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<AccountRequest>().currentUser;
    if (!user) return true;

    const status = await this.cache.getOrSet<AccountStatus>('account_status', this.cacheKey(user.id), 30, async () => {
      const [profile] = await this.write.db
        .select({ accountStatus: profiles.accountStatus })
        .from(profiles)
        .where(eq(profiles.keycloakSub, user.id))
        .limit(1);
      if (profile) return profile.accountStatus;
      const [erasure] = await this.write.db
        .select({ status: accountDeletions.status })
        .from(accountDeletions)
        .where(and(eq(accountDeletions.subjectHash, this.cacheKey(user.id)), ne(accountDeletions.status, 'CANCELLED')))
        .limit(1);
      return erasure ? 'ANONYMIZED' : 'MISSING';
    });
    if (status === 'ACTIVE' || status === 'MISSING') return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE_ACCOUNT, [
      context.getClass(),
      context.getHandler()
    ]);
    if (allowed) return true;

    const errorCode =
      status === 'DEACTIVATED'
        ? 'ACCOUNT_DEACTIVATED'
        : status === 'PENDING_DELETION'
          ? 'ACCOUNT_DELETION_PENDING'
          : 'ACCOUNT_DELETED';
    throw new ForbiddenException(errorCode);
  }

  static subjectCacheKey(subject: string): string {
    return createHash('sha256').update(subject).digest('hex');
  }

  private cacheKey(subject: string): string {
    return AccountStatusGuard.subjectCacheKey(subject);
  }
}
