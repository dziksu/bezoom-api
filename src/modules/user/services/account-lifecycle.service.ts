import { createHash } from 'node:crypto';
import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ICurrentUser } from '@api/shared/domain/auth';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { accountDeletions, events, profiles } from '@api/shared/infrastructure/database/schema';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import type { AccountLifecycleConfig } from '@api/shared/infrastructure/config/account-lifecycle.config';
import type { AccountLifecycleResponseDto, AccountStatus } from '../dto/account-lifecycle.dto';
import { KeycloakAccountManagementService } from '../infrastructure/keycloak-account-management.service';

const KEYCLOAK_MANAGED = [
  'EMAIL',
  'FIRST_NAME',
  'LAST_NAME',
  'PASSWORD',
  'MFA',
  'SESSIONS',
  'LINKED_IDENTITIES'
] as const;
const MAX_AUTH_AGE_SECONDS = 5 * 60;

@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);

  constructor(
    private readonly write: DrizzleWriteService,
    private readonly cache: RedisCacheService,
    private readonly config: ConfigService,
    private readonly keycloak: KeycloakAccountManagementService
  ) {}

  async getStatus(user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    const profile = await this.ensureIdentityProfile(user);
    return this.response(profile.id, profile.accountStatus);
  }

  async deactivate(user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    this.requireRecentAuthentication(user);
    const profile = await this.ensureIdentityProfile(user);
    if (profile.accountStatus === 'PENDING_DELETION' || profile.accountStatus === 'ANONYMIZED') {
      throw new ConflictException('ACCOUNT_DELETION_PENDING');
    }
    if (profile.accountStatus !== 'DEACTIVATED') {
      await this.write.db
        .update(profiles)
        .set({ accountStatus: 'DEACTIVATED', isDeactivated: true, updatedAt: new Date() })
        .where(eq(profiles.id, profile.id));
      await this.invalidateStatus(user.id);
      await this.invalidatePublicPresence(user.id);
    }
    await this.revokeSessionsBestEffort(user.id);
    return this.response(profile.id, 'DEACTIVATED');
  }

  async reactivate(user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    this.requireRecentAuthentication(user);
    const profile = await this.ensureIdentityProfile(user);
    if (profile.accountStatus === 'PENDING_DELETION' || profile.accountStatus === 'ANONYMIZED') {
      throw new ConflictException('ACCOUNT_DELETION_PENDING');
    }
    if (profile.accountStatus !== 'ACTIVE') {
      await this.write.db
        .update(profiles)
        .set({ accountStatus: 'ACTIVE', isDeactivated: false, updatedAt: new Date() })
        .where(eq(profiles.id, profile.id));
      await this.invalidateStatus(user.id);
      await this.invalidatePublicPresence(user.id);
    }
    return this.response(profile.id, 'ACTIVE');
  }

  async requestDeletion(user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    this.requireRecentAuthentication(user);
    const profile = await this.ensureIdentityProfile(user);
    const existing = await this.activeDeletion(profile.id);
    if (existing) return this.response(profile.id, 'PENDING_DELETION', existing.scheduledAt);
    if (profile.accountStatus === 'ANONYMIZED') throw new ConflictException('ACCOUNT_DELETION_ALREADY_FINALIZED');

    const settings = this.settings();
    const scheduledAt = new Date(Date.now() + settings.deletionGraceDays * 86_400_000);
    await this.write.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM profiles WHERE id = ${profile.id} FOR UPDATE`);
      const [race] = await tx
        .select({ id: accountDeletions.id, scheduledAt: accountDeletions.scheduledAt })
        .from(accountDeletions)
        .where(
          and(
            eq(accountDeletions.profileId, profile.id),
            inArray(accountDeletions.status, ['REQUESTED', 'ANONYMIZING', 'ANONYMIZED'])
          )
        )
        .limit(1);
      if (race) return;

      await tx
        .update(profiles)
        .set({ accountStatus: 'PENDING_DELETION', isDeactivated: true, updatedAt: new Date() })
        .where(eq(profiles.id, profile.id));
      await tx.insert(accountDeletions).values({
        profileId: profile.id,
        keycloakUserId: user.id,
        subjectHash: createHash('sha256').update(user.id).digest('hex'),
        status: 'REQUESTED',
        scheduledAt,
        nextAttemptAt: scheduledAt
      });
    });
    await this.invalidateStatus(user.id);
    await this.invalidatePublicPresence(user.id);
    await this.revokeSessionsBestEffort(user.id);
    return this.response(profile.id, 'PENDING_DELETION', scheduledAt);
  }

  async cancelDeletion(user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    this.requireRecentAuthentication(user);
    const profile = await this.ensureIdentityProfile(user);
    const deletion = await this.activeDeletion(profile.id);
    if (!deletion) {
      if (profile.accountStatus === 'ANONYMIZED') throw new ConflictException('ACCOUNT_DELETION_ALREADY_FINALIZED');
      return this.response(profile.id, profile.accountStatus);
    }
    if (deletion.status !== 'REQUESTED') throw new ConflictException('ACCOUNT_DELETION_ALREADY_FINALIZED');

    await this.write.db.transaction(async (tx) => {
      await tx
        .update(accountDeletions)
        .set({ status: 'CANCELLED', completedAt: new Date() })
        .where(and(eq(accountDeletions.id, deletion.id), eq(accountDeletions.status, 'REQUESTED')));
      await tx
        .update(profiles)
        .set({ accountStatus: 'ACTIVE', isDeactivated: false, updatedAt: new Date() })
        .where(eq(profiles.id, profile.id));
    });
    await this.invalidateStatus(user.id);
    await this.invalidatePublicPresence(user.id);
    return this.response(profile.id, 'ACTIVE');
  }

  private async ensureIdentityProfile(user: ICurrentUser) {
    const subjectHash = createHash('sha256').update(user.id).digest('hex');
    const [erasure] = await this.write.db
      .select({ status: accountDeletions.status })
      .from(accountDeletions)
      .where(
        and(
          eq(accountDeletions.subjectHash, subjectHash),
          inArray(accountDeletions.status, ['ANONYMIZED', 'COMPLETED'])
        )
      )
      .limit(1);
    if (erasure) throw new ConflictException('ACCOUNT_DELETED');

    await this.write.db
      .insert(profiles)
      .values({
        keycloakSub: user.id,
        email: user.emailVerified === true ? (user.email ?? null) : null,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        identitySyncedAt: user.issuedAt ? new Date(user.issuedAt * 1_000) : null,
        accountType: 'personal'
      })
      .onConflictDoNothing({ target: profiles.keycloakSub });
    const [profile] = await this.write.db
      .select({ id: profiles.id, accountStatus: profiles.accountStatus })
      .from(profiles)
      .where(eq(profiles.keycloakSub, user.id))
      .limit(1);
    if (!profile) throw new ConflictException('ACCOUNT_DELETED');
    return profile;
  }

  private async activeDeletion(profileId: string) {
    const [deletion] = await this.write.db
      .select({
        id: accountDeletions.id,
        status: accountDeletions.status,
        scheduledAt: accountDeletions.scheduledAt
      })
      .from(accountDeletions)
      .where(
        and(
          eq(accountDeletions.profileId, profileId),
          inArray(accountDeletions.status, ['REQUESTED', 'ANONYMIZING', 'ANONYMIZED'])
        )
      )
      .limit(1);
    return deletion;
  }

  private async response(
    profileId: string,
    status: AccountStatus,
    knownScheduledAt?: Date
  ): Promise<AccountLifecycleResponseDto> {
    const deletion = knownScheduledAt ? undefined : await this.activeDeletion(profileId);
    return {
      status,
      deletionScheduledAt: knownScheduledAt ?? deletion?.scheduledAt,
      accountConsoleUrl: this.keycloak.accountConsoleUrl(),
      managedByKeycloak: [...KEYCLOAK_MANAGED]
    };
  }

  private requireRecentAuthentication(user: ICurrentUser): void {
    const nowSeconds = Math.floor(Date.now() / 1_000);
    if (!user.authTime || nowSeconds - user.authTime > MAX_AUTH_AGE_SECONDS) {
      throw new UnauthorizedException('ACCOUNT_REAUTHENTICATION_REQUIRED');
    }
  }

  private async invalidateStatus(subject: string): Promise<void> {
    const key = createHash('sha256').update(subject).digest('hex');
    await this.cache.delete('account_status', key);
  }

  private async invalidatePublicPresence(subject: string): Promise<void> {
    const ownedEvents = await this.write.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.organizerKeycloakSub, subject));
    await Promise.all(ownedEvents.map((event) => this.cache.delete('event_detail', event.id)));
    await this.cache.clearNamespace('event_search');
    await this.cache.incrementVersion('event_map');
  }

  private async revokeSessionsBestEffort(subject: string): Promise<void> {
    try {
      await this.keycloak.logoutUser(subject);
    } catch {
      this.logger.warn('ACCOUNT_SESSION_REVOCATION_DEFERRED');
    }
  }

  private settings(): AccountLifecycleConfig {
    const settings = this.config.get<AccountLifecycleConfig>('accountLifecycle');
    if (!settings) throw new ConflictException('ACCOUNT_LIFECYCLE_NOT_CONFIGURED');
    return settings;
  }
}
