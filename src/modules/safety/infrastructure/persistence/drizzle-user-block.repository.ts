import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { events, profiles, userBlocks } from '@api/shared/infrastructure/database/schema';
import { decodeTimestampCursor, encodeTimestampCursor } from '@api/shared/domain/cursor-pagination';
import {
  UserBlockRepository,
  type BlockedProfileRecord,
  type BlockedProfilesPage
} from '../../domain/user-block.repository';

const BLOCKED_USERS_CURSOR = 'blocked_users';

@Injectable()
export class DrizzleUserBlockRepository extends UserBlockRepository {
  constructor(
    private readonly write: DrizzleWriteService,
    private readonly read: DrizzleReadService
  ) {
    super();
  }

  async block(blockerKeycloakSub: string, blockedProfileId: string): Promise<BlockedProfileRecord | null> {
    const [target] = await this.write.db
      .select({
        profileId: profiles.id,
        keycloakSub: profiles.keycloakSub,
        username: profiles.username,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        avatarUrl: profiles.avatarUrl
      })
      .from(profiles)
      .where(and(eq(profiles.id, blockedProfileId), eq(profiles.isDeactivated, false)))
      .limit(1);
    if (!target) return null;

    // Let the application handler return a stable domain key before the DB
    // self-block check can be reached.
    if (target.keycloakSub === blockerKeycloakSub) {
      return { ...target, blockId: '', blockedAt: new Date() };
    }

    const [created] = await this.write.db
      .insert(userBlocks)
      .values({ blockerKeycloakSub, blockedKeycloakSub: target.keycloakSub })
      .onConflictDoNothing()
      .returning({ id: userBlocks.id, createdAt: userBlocks.createdAt });

    const stored =
      created ??
      (
        await this.write.db
          .select({ id: userBlocks.id, createdAt: userBlocks.createdAt })
          .from(userBlocks)
          .where(
            and(
              eq(userBlocks.blockerKeycloakSub, blockerKeycloakSub),
              eq(userBlocks.blockedKeycloakSub, target.keycloakSub)
            )
          )
          .limit(1)
      )[0];

    return { ...target, blockId: stored.id, blockedAt: stored.createdAt };
  }

  async unblock(blockerKeycloakSub: string, blockedProfileId: string): Promise<boolean> {
    const [target] = await this.write.db
      .select({ keycloakSub: profiles.keycloakSub })
      .from(profiles)
      .where(eq(profiles.id, blockedProfileId))
      .limit(1);
    if (!target) return false;

    const deleted = await this.write.db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerKeycloakSub, blockerKeycloakSub),
          eq(userBlocks.blockedKeycloakSub, target.keycloakSub)
        )
      )
      .returning({ id: userBlocks.id });
    return deleted.length > 0;
  }

  async list(blockerKeycloakSub: string, cursorValue: string | undefined, limit: number): Promise<BlockedProfilesPage> {
    const cursor = decodeTimestampCursor(cursorValue, BLOCKED_USERS_CURSOR);
    const rows = await this.read.db
      .select({
        blockId: userBlocks.id,
        profileId: profiles.id,
        keycloakSub: profiles.keycloakSub,
        username: profiles.username,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        avatarUrl: profiles.avatarUrl,
        blockedAt: userBlocks.createdAt
      })
      .from(userBlocks)
      .innerJoin(profiles, eq(profiles.keycloakSub, userBlocks.blockedKeycloakSub))
      .where(
        and(
          eq(userBlocks.blockerKeycloakSub, blockerKeycloakSub),
          cursor
            ? or(
                lt(userBlocks.createdAt, cursor.timestamp),
                and(eq(userBlocks.createdAt, cursor.timestamp), lt(userBlocks.id, cursor.id))
              )
            : undefined
        )
      )
      .orderBy(desc(userBlocks.createdAt), desc(userBlocks.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items,
      hasMore,
      nextCursor:
        hasMore && last ? encodeTimestampCursor(BLOCKED_USERS_CURSOR, last.blockedAt, last.blockId) : undefined
    };
  }

  async isBlockedBetween(firstKeycloakSub: string, secondKeycloakSub: string): Promise<boolean> {
    if (firstKeycloakSub === secondKeycloakSub) return false;
    // Safety decisions use the primary so a just-created block cannot be
    // bypassed by replica lag.
    const [block] = await this.write.db
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerKeycloakSub, firstKeycloakSub),
            eq(userBlocks.blockedKeycloakSub, secondKeycloakSub)
          ),
          and(eq(userBlocks.blockerKeycloakSub, secondKeycloakSub), eq(userBlocks.blockedKeycloakSub, firstKeycloakSub))
        )
      )
      .limit(1);
    return Boolean(block);
  }

  async isEventOrganizerBlocked(viewerKeycloakSub: string, eventId: string): Promise<boolean> {
    const [block] = await this.write.db
      .select({ id: userBlocks.id })
      .from(events)
      .innerJoin(
        userBlocks,
        or(
          and(
            eq(userBlocks.blockerKeycloakSub, viewerKeycloakSub),
            eq(userBlocks.blockedKeycloakSub, events.organizerKeycloakSub)
          ),
          and(
            eq(userBlocks.blockedKeycloakSub, viewerKeycloakSub),
            eq(userBlocks.blockerKeycloakSub, events.organizerKeycloakSub)
          )
        )
      )
      .where(eq(events.id, eventId))
      .limit(1);
    return Boolean(block);
  }
}
