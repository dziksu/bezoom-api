import { createHash } from 'node:crypto';
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import type { AccountLifecycleConfig } from '@api/shared/infrastructure/config/account-lifecycle.config';
import {
  accountDeletionObjects,
  accountDeletions,
  businesses,
  eventPhotos,
  events,
  friendships,
  moderationReports,
  notifications,
  profiles,
  userBlocks
} from '@api/shared/infrastructure/database/schema';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { KeycloakAccountManagementService } from '../infrastructure/keycloak-account-management.service';

interface ClaimedDeletion {
  id: string;
  profile_id: string;
  keycloak_user_id: string;
  status: 'ANONYMIZING' | 'ANONYMIZED';
}

@Injectable()
export class AccountDeletionWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionWorker.name);
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private shuttingDown = false;

  constructor(
    private readonly write: DrizzleWriteService,
    private readonly storage: ObjectStorageService,
    private readonly keycloak: KeycloakAccountManagementService,
    private readonly cache: RedisCacheService,
    private readonly config: ConfigService
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.settings().workerIntervalMs;
    this.triggerTick();
    this.timer = setInterval(() => this.triggerTick(), intervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) clearInterval(this.timer);
    await this.inFlight;
  }

  async processDueDeletion(): Promise<boolean> {
    const deletion = await this.claimDueDeletion();
    if (!deletion) return false;

    try {
      if (deletion.status === 'ANONYMIZING') await this.anonymizeDomainData(deletion);
      await this.deleteStorageObjects(deletion.id);
      await this.keycloak.deleteUser(deletion.keycloak_user_id);
      await this.finalizeIdentityDeletion(deletion);
      this.logger.log('ACCOUNT_DELETION_COMPLETED');
    } catch (error) {
      this.logger.error('ACCOUNT_DELETION_RETRY_SCHEDULED', error instanceof Error ? error.stack : undefined);
    }
    return true;
  }

  private triggerTick(): void {
    if (this.shuttingDown || this.inFlight) return;
    const task = this.tick();
    this.inFlight = task;
    void task.finally(() => {
      if (this.inFlight === task) this.inFlight = undefined;
    });
  }

  private async tick(): Promise<void> {
    try {
      let processed: boolean;
      do {
        processed = await this.processDueDeletion();
      } while (processed);
    } catch (error) {
      this.logger.error('ACCOUNT_DELETION_WORKER_FAILED', error instanceof Error ? error.stack : undefined);
    }
  }

  private async claimDueDeletion(): Promise<ClaimedDeletion | null> {
    const result: unknown = await this.write.db.execute(sql`
      WITH candidate AS (
        SELECT id
        FROM account_deletions
        WHERE status IN ('REQUESTED', 'ANONYMIZING', 'ANONYMIZED')
          AND next_attempt_at <= now()
        ORDER BY next_attempt_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE account_deletions deletion
      SET
        status = CASE WHEN deletion.status = 'REQUESTED' THEN 'ANONYMIZING' ELSE deletion.status END,
        attempts = deletion.attempts + 1,
        last_attempt_at = now(),
        next_attempt_at = now() + interval '5 minutes'
      FROM candidate
      WHERE deletion.id = candidate.id
      RETURNING deletion.id, deletion.profile_id, deletion.keycloak_user_id, deletion.status
    `);
    const row = (result as { rows: ClaimedDeletion[] }).rows[0];
    return row?.keycloak_user_id ? row : null;
  }

  private async anonymizeDomainData(deletion: ClaimedDeletion): Promise<void> {
    const affectedEventIds = await this.write.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM profiles WHERE id = ${deletion.profile_id} FOR UPDATE`);
      const [profile] = await tx
        .select({ avatarStoragePath: profiles.avatarStoragePath })
        .from(profiles)
        .where(eq(profiles.id, deletion.profile_id))
        .limit(1);
      if (!profile) return [];

      const photoRows = await tx
        .select({ id: eventPhotos.id, eventId: eventPhotos.eventId, rawKey: eventPhotos.rawKey })
        .from(eventPhotos)
        .where(eq(eventPhotos.ownerKeycloakSub, deletion.keycloak_user_id));
      const storageObjects = [
        ...(profile.avatarStoragePath ? [this.storagePath(profile.avatarStoragePath)] : []),
        ...photoRows.map((photo) => ({ bucket: this.storage.rawBucket, objectKey: photo.rawKey }))
      ];
      if (storageObjects.length > 0) {
        await tx
          .insert(accountDeletionObjects)
          .values(storageObjects.map((object) => ({ deletionId: deletion.id, ...object })))
          .onConflictDoNothing();
      }

      const deltaResult: unknown = await tx.execute(sql`
        WITH
        like_counts AS MATERIALIZED (
          SELECT event_id, count(*)::integer AS count FROM event_likes
          WHERE keycloak_sub = ${deletion.keycloak_user_id} GROUP BY event_id
        ),
        save_counts AS MATERIALIZED (
          SELECT event_id, count(*)::integer AS count FROM event_saves
          WHERE keycloak_sub = ${deletion.keycloak_user_id} GROUP BY event_id
        ),
        attending_counts AS MATERIALIZED (
          SELECT event_id, count(*)::integer AS count FROM event_participants
          WHERE keycloak_sub = ${deletion.keycloak_user_id} AND status = 'CONFIRMED' GROUP BY event_id
        ),
        comment_counts AS MATERIALIZED (
          SELECT event_id, count(*)::integer AS count FROM event_comments
          WHERE author_keycloak_sub = ${deletion.keycloak_user_id} AND deleted_at IS NULL GROUP BY event_id
        ),
        deleted_likes AS (
          DELETE FROM event_likes WHERE keycloak_sub = ${deletion.keycloak_user_id}
        ),
        deleted_saves AS (
          DELETE FROM event_saves WHERE keycloak_sub = ${deletion.keycloak_user_id}
        ),
        deleted_participants AS (
          DELETE FROM event_participants WHERE keycloak_sub = ${deletion.keycloak_user_id}
        ),
        deleted_comments AS (
          UPDATE event_comments
          SET body = '', deleted_at = coalesce(deleted_at, now()), updated_at = now()
          WHERE author_keycloak_sub = ${deletion.keycloak_user_id}
        ),
        affected AS (
          SELECT event_id FROM like_counts UNION SELECT event_id FROM save_counts
          UNION SELECT event_id FROM attending_counts UNION SELECT event_id FROM comment_counts
        )
        INSERT INTO event_outbox (aggregate_id, event_type, payload)
        SELECT
          affected.event_id,
          'event.stats.changed',
          jsonb_build_object(
            'likesDelta', -coalesce(like_counts.count, 0),
            'savesDelta', -coalesce(save_counts.count, 0),
            'attendingDelta', -coalesce(attending_counts.count, 0),
            'commentsDelta', -coalesce(comment_counts.count, 0)
          )
        FROM affected
        LEFT JOIN like_counts USING (event_id)
        LEFT JOIN save_counts USING (event_id)
        LEFT JOIN attending_counts USING (event_id)
        LEFT JOIN comment_counts USING (event_id)
        RETURNING aggregate_id
      `);

      await tx
        .delete(userBlocks)
        .where(
          sql`${userBlocks.blockerKeycloakSub} = ${deletion.keycloak_user_id} OR ${userBlocks.blockedKeycloakSub} = ${deletion.keycloak_user_id}`
        );
      await tx
        .delete(friendships)
        .where(
          sql`${friendships.keycloakSub1} = ${deletion.keycloak_user_id} OR ${friendships.keycloakSub2} = ${deletion.keycloak_user_id}`
        );
      await tx.delete(notifications).where(eq(notifications.keycloakSub, deletion.keycloak_user_id));
      await tx.delete(businesses).where(eq(businesses.keycloakSub, deletion.keycloak_user_id));

      await tx
        .delete(eventPhotos)
        .where(and(eq(eventPhotos.ownerKeycloakSub, deletion.keycloak_user_id), isNull(eventPhotos.eventId)));
      for (const photo of photoRows.filter((row) => row.eventId !== null)) {
        await tx
          .update(eventPhotos)
          .set({ rawKey: `deleted/${photo.id}`, updatedAt: new Date() })
          .where(eq(eventPhotos.id, photo.id));
      }

      const ownedEvents = await tx
        .update(events)
        .set({ status: 'CANCELLED', archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(events.organizerKeycloakSub, deletion.keycloak_user_id))
        .returning({ id: events.id });
      await tx.execute(sql`
        UPDATE event_outbox
        SET payload = payload - 'organizerKeycloakSub'
        WHERE payload->>'organizerKeycloakSub' = ${deletion.keycloak_user_id}
      `);

      await tx
        .update(profiles)
        .set({
          accountStatus: 'ANONYMIZED',
          isDeactivated: true,
          firstName: null,
          lastName: null,
          username: null,
          email: null,
          identitySyncedAt: null,
          phoneNumber: null,
          bio: null,
          avatarUrl: null,
          avatarStoragePath: null,
          interests: null,
          isPhoneVerified: false,
          phoneVerificationToken: null,
          phoneVerificationExpiresAt: null,
          phoneVerificationSentAt: null,
          phoneVerificationAttempts: 0,
          businessName: null,
          nip: null,
          businessDescription: null,
          websiteUrl: null,
          businessVerificationStatus: null,
          businessVerificationDate: null,
          updatedAt: new Date()
        })
        .where(eq(profiles.id, deletion.profile_id));
      await tx
        .update(accountDeletions)
        .set({ status: 'ANONYMIZED', anonymizedAt: new Date() })
        .where(eq(accountDeletions.id, deletion.id));

      return [
        ...(deltaResult as { rows: Array<{ aggregate_id: string }> }).rows.map((row) => row.aggregate_id),
        ...ownedEvents.map((event) => event.id)
      ];
    });

    await Promise.all([...new Set(affectedEventIds)].map((eventId) => this.cache.delete('event_detail', eventId)));
    await this.cache.clearNamespace('event_search');
    await this.invalidateAccountStatus(deletion.keycloak_user_id);
  }

  private async deleteStorageObjects(deletionId: string): Promise<void> {
    const objects = await this.write.db
      .select()
      .from(accountDeletionObjects)
      .where(and(eq(accountDeletionObjects.deletionId, deletionId), isNull(accountDeletionObjects.processedAt)));
    for (const object of objects) {
      try {
        await this.storage.removeObject(object.bucket, object.objectKey);
        await this.write.db
          .update(accountDeletionObjects)
          .set({
            processedAt: new Date(),
            attempts: sql`${accountDeletionObjects.attempts} + 1`,
            lastAttemptAt: new Date()
          })
          .where(eq(accountDeletionObjects.id, object.id));
      } catch (error) {
        await this.write.db
          .update(accountDeletionObjects)
          .set({ attempts: sql`${accountDeletionObjects.attempts} + 1`, lastAttemptAt: new Date() })
          .where(eq(accountDeletionObjects.id, object.id));
        throw error;
      }
    }
  }

  private async finalizeIdentityDeletion(deletion: ClaimedDeletion): Promise<void> {
    const tombstone = `deleted:${deletion.profile_id}`;
    await this.write.db.transaction(async (tx) => {
      await tx
        .update(events)
        .set({ organizerKeycloakSub: tombstone, updatedAt: new Date() })
        .where(eq(events.organizerKeycloakSub, deletion.keycloak_user_id));
      await tx
        .update(eventPhotos)
        .set({ ownerKeycloakSub: tombstone, updatedAt: new Date() })
        .where(eq(eventPhotos.ownerKeycloakSub, deletion.keycloak_user_id));
      await tx.execute(sql`
        UPDATE event_comments SET author_keycloak_sub = ${tombstone}
        WHERE author_keycloak_sub = ${deletion.keycloak_user_id}
      `);
      await tx
        .update(moderationReports)
        .set({ reportedByKeycloakSub: tombstone })
        .where(eq(moderationReports.reportedByKeycloakSub, deletion.keycloak_user_id));
      await tx
        .update(profiles)
        .set({ keycloakSub: tombstone, updatedAt: new Date() })
        .where(eq(profiles.id, deletion.profile_id));
      await tx
        .update(accountDeletions)
        .set({ status: 'COMPLETED', keycloakUserId: null, completedAt: new Date() })
        .where(eq(accountDeletions.id, deletion.id));
    });
    await this.invalidateAccountStatus(deletion.keycloak_user_id);
  }

  private storagePath(value: string): { bucket: string; objectKey: string } {
    const [bucket, ...parts] = value.split('/');
    return { bucket, objectKey: parts.join('/') };
  }

  private async invalidateAccountStatus(subject: string): Promise<void> {
    const key = createHash('sha256').update(subject).digest('hex');
    await this.cache.delete('account_status', key);
  }

  private settings(): AccountLifecycleConfig {
    return this.config.get<AccountLifecycleConfig>('accountLifecycle')!;
  }
}
