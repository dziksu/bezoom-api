import type { RsvpStatus } from './rsvp-status';

export interface EventVisibilitySnapshot {
  id: string;
  status: string;
  visibility: string;
  verificationStatus: string;
  mediaPipelineStatus: string | null;
}

export interface EventStatsSnapshot {
  likesCount: number;
  savesCount: number;
  attendingCount: number;
  commentsCount: number;
}

export const isEventAvailableForEngagement = (event: EventVisibilitySnapshot): boolean =>
  event.status === 'PUBLISHED' &&
  event.mediaPipelineStatus === 'READY' &&
  event.verificationStatus === 'VERIFIED' &&
  event.visibility === 'PUBLIC';

/**
 * Write-side port for lightweight event engagement (likes / saves / RSVP).
 *
 * These are simple join records with their own lifecycle, not part of the Event
 * aggregate — so they live behind their own port rather than loading the aggregate.
 * The underlying tables have no FK to `events`, so callers MUST verify existence
 * via `findEventForEngagement` before writing to avoid orphan rows.
 *
 * Abstract class doubles as the Nest DI token.
 */
export abstract class EventEngagementRepository {
  abstract findEventForEngagement(eventId: string): Promise<EventVisibilitySnapshot | null>;

  /** Idempotent: liking an already-liked event is a no-op. */
  abstract setLike(eventId: string, keycloakSub: string, liked: boolean): Promise<void>;

  /** Idempotent: saving an already-saved event is a no-op. */
  abstract setSave(eventId: string, keycloakSub: string, saved: boolean): Promise<void>;

  /** Upsert (insert or update status). */
  abstract setRsvp(eventId: string, keycloakSub: string, status: RsvpStatus): Promise<void>;
  abstract cancelRsvp(eventId: string, keycloakSub: string): Promise<void>;
  /** Eventually-consistent read model. Never calculated from interaction tables on the request path. */
  abstract getStats(eventId: string): Promise<EventStatsSnapshot>;
}
