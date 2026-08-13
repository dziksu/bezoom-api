export interface BlockedProfileRecord {
  blockId: string;
  profileId: string;
  keycloakSub: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  blockedAt: Date;
}

export interface BlockedProfilesPage {
  items: BlockedProfileRecord[];
  hasMore: boolean;
  nextCursor?: string;
}

export abstract class UserBlockRepository {
  /** Resolves the public profile id and creates an idempotent block. */
  abstract block(blockerKeycloakSub: string, blockedProfileId: string): Promise<BlockedProfileRecord | null>;
  abstract unblock(blockerKeycloakSub: string, blockedProfileId: string): Promise<boolean>;
  abstract list(blockerKeycloakSub: string, cursor: string | undefined, limit: number): Promise<BlockedProfilesPage>;
  abstract isBlockedBetween(firstKeycloakSub: string, secondKeycloakSub: string): Promise<boolean>;
  abstract isEventOrganizerBlocked(viewerKeycloakSub: string, eventId: string): Promise<boolean>;
}
