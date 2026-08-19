import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { decodeTimestampCursor, encodeTimestampCursor } from '@api/shared/domain/cursor-pagination';
import { creatorFollows, events, profiles } from '@api/shared/infrastructure/database/schema';
import { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';
import type { CursorFollowedProfilesDto, FollowCreatorResponseDto, FollowedProfileDto } from '../dto/profile.dto';

type ProfileRow = typeof profiles.$inferSelect;

@Injectable()
export class CreatorFollowService {
  constructor(
    private readonly write: DrizzleWriteService,
    private readonly read: DrizzleReadService,
    private readonly blocks: UserBlockRepository
  ) {}

  async follow(followerKeycloakSub: string, profileId: string): Promise<FollowCreatorResponseDto> {
    const target = await this.findFollowableCreator(profileId);
    if (!target) throw new ConflictException('PROFILE_NOT_FOLLOWABLE');
    if (target.keycloakSub === followerKeycloakSub) throw new ConflictException('CANNOT_FOLLOW_SELF');
    if (await this.blocks.isBlockedBetween(followerKeycloakSub, target.keycloakSub)) {
      throw new ConflictException('FOLLOW_BLOCKED');
    }

    return this.write.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(creatorFollows)
        .values({ followerKeycloakSub, followeeKeycloakSub: target.keycloakSub })
        .onConflictDoNothing()
        .returning({ id: creatorFollows.id });

      if (created) {
        const followerUpdated = await tx
          .update(profiles)
          .set({ followingCount: sql`${profiles.followingCount} + 1`, updatedAt: new Date() })
          .where(and(eq(profiles.keycloakSub, followerKeycloakSub), eq(profiles.accountStatus, 'ACTIVE')))
          .returning({ count: profiles.followingCount });
        if (followerUpdated.length === 0) throw new NotFoundException('PROFILE_NOT_FOUND');

        const followeeUpdated = await tx
          .update(profiles)
          .set({ followersCount: sql`${profiles.followersCount} + 1`, updatedAt: new Date() })
          .where(and(eq(profiles.keycloakSub, target.keycloakSub), eq(profiles.accountStatus, 'ACTIVE')))
          .returning({ count: profiles.followersCount });
        if (followeeUpdated.length === 0) throw new ConflictException('PROFILE_NOT_FOLLOWABLE');
      }

      const [follower] = await tx
        .select({ count: profiles.followingCount })
        .from(profiles)
        .where(eq(profiles.keycloakSub, followerKeycloakSub))
        .limit(1);
      const [followee] = await tx
        .select({ count: profiles.followersCount })
        .from(profiles)
        .where(eq(profiles.keycloakSub, target.keycloakSub))
        .limit(1);
      if (!follower || !followee) throw new NotFoundException('PROFILE_NOT_FOUND');

      return {
        profileId,
        isFollowing: true,
        followersCount: followee.count,
        followingCount: follower.count
      };
    });
  }

  async unfollow(followerKeycloakSub: string, profileId: string): Promise<FollowCreatorResponseDto> {
    const [target] = await this.write.db
      .select({ keycloakSub: profiles.keycloakSub })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    if (!target) throw new NotFoundException('PROFILE_NOT_FOUND');

    return this.write.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(creatorFollows)
        .where(
          and(
            eq(creatorFollows.followerKeycloakSub, followerKeycloakSub),
            eq(creatorFollows.followeeKeycloakSub, target.keycloakSub)
          )
        )
        .returning({ id: creatorFollows.id });

      if (deleted.length > 0) {
        await tx
          .update(profiles)
          .set({ followingCount: sql`greatest(${profiles.followingCount} - 1, 0)`, updatedAt: new Date() })
          .where(eq(profiles.keycloakSub, followerKeycloakSub));
        await tx
          .update(profiles)
          .set({ followersCount: sql`greatest(${profiles.followersCount} - 1, 0)`, updatedAt: new Date() })
          .where(eq(profiles.keycloakSub, target.keycloakSub));
      }

      const [follower] = await tx
        .select({ count: profiles.followingCount })
        .from(profiles)
        .where(eq(profiles.keycloakSub, followerKeycloakSub))
        .limit(1);
      const [followee] = await tx
        .select({ count: profiles.followersCount })
        .from(profiles)
        .where(eq(profiles.keycloakSub, target.keycloakSub))
        .limit(1);
      if (!follower || !followee) throw new NotFoundException('PROFILE_NOT_FOUND');

      return {
        profileId,
        isFollowing: false,
        followersCount: followee.count,
        followingCount: follower.count
      };
    });
  }

  async listFollowing(
    followerKeycloakSub: string,
    cursorValue: string | undefined,
    limit: number
  ): Promise<CursorFollowedProfilesDto> {
    return this.list('following', followerKeycloakSub, cursorValue, limit);
  }

  async listFollowers(
    followeeKeycloakSub: string,
    cursorValue: string | undefined,
    limit: number
  ): Promise<CursorFollowedProfilesDto> {
    await this.ensureCreator(followeeKeycloakSub);
    return this.list('followers', followeeKeycloakSub, cursorValue, limit);
  }

  private async list(
    mode: 'following' | 'followers',
    keycloakSub: string,
    cursorValue: string | undefined,
    limit: number
  ): Promise<CursorFollowedProfilesDto> {
    const cursorKind = mode === 'following' ? 'my_following' : 'my_followers';
    const cursor = decodeTimestampCursor(cursorValue, cursorKind);
    const relationOwner =
      mode === 'following'
        ? eq(creatorFollows.followerKeycloakSub, keycloakSub)
        : eq(creatorFollows.followeeKeycloakSub, keycloakSub);
    const profileJoin =
      mode === 'following'
        ? eq(profiles.keycloakSub, creatorFollows.followeeKeycloakSub)
        : eq(profiles.keycloakSub, creatorFollows.followerKeycloakSub);

    const rows = await this.read.db
      .select({
        followId: creatorFollows.id,
        followedAt: creatorFollows.createdAt,
        profile: profiles,
        isCreator: sql<boolean>`EXISTS (
          SELECT 1 FROM ${events} creator_event
          WHERE creator_event.organizer_keycloak_sub = ${profiles.keycloakSub}
            AND creator_event.archived_at IS NULL
        )`
      })
      .from(creatorFollows)
      .innerJoin(profiles, profileJoin)
      .where(
        and(
          relationOwner,
          eq(profiles.accountStatus, 'ACTIVE'),
          cursor
            ? or(
                lt(creatorFollows.createdAt, cursor.timestamp),
                and(eq(creatorFollows.createdAt, cursor.timestamp), lt(creatorFollows.id, cursor.id))
              )
            : undefined
        )
      )
      .orderBy(desc(creatorFollows.createdAt), desc(creatorFollows.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row) => this.toListItem(row.profile, row.followedAt, row.isCreator)),
      hasMore,
      nextCursor: hasMore && last ? encodeTimestampCursor(cursorKind, last.followedAt, last.followId) : undefined
    };
  }

  private async findFollowableCreator(profileId: string): Promise<ProfileRow | undefined> {
    const [profile] = await this.write.db
      .select()
      .from(profiles)
      .where(
        and(
          eq(profiles.id, profileId),
          eq(profiles.accountStatus, 'ACTIVE'),
          eq(profiles.isPhoneVerified, true),
          sql`EXISTS (
            SELECT 1 FROM ${events} creator_event
            WHERE creator_event.organizer_keycloak_sub = ${profiles.keycloakSub}
              AND creator_event.archived_at IS NULL
          )`
        )
      )
      .limit(1);
    return profile;
  }

  private async ensureCreator(keycloakSub: string): Promise<void> {
    const [profile] = await this.read.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.keycloakSub, keycloakSub),
          eq(profiles.isPhoneVerified, true),
          sql`EXISTS (
            SELECT 1 FROM ${events} creator_event
            WHERE creator_event.organizer_keycloak_sub = ${profiles.keycloakSub}
              AND creator_event.archived_at IS NULL
          )`
        )
      )
      .limit(1);
    if (!profile) throw new ForbiddenException('CREATOR_REQUIRED');
  }

  private toListItem(profile: ProfileRow, followedAt: Date, isCreator: boolean): FollowedProfileDto {
    return {
      id: profile.id,
      accountType: profile.accountType === 'business' ? 'business' : 'personal',
      displayName:
        profile.businessName ||
        [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
        (profile.username ? `@${profile.username}` : 'Użytkownik BeZoom'),
      username: profile.username ?? undefined,
      avatarUrl: profile.avatarUrl ?? undefined,
      followersCount: profile.followersCount,
      isCreator,
      followedAt
    };
  }
}
