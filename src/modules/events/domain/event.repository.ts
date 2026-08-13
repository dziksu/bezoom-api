import { Event } from './event.aggregate';

export interface PendingPhoto {
  id: string;
  ownerKeycloakSub: string;
  rawKey: string;
  mimeType: string;
}

export interface NewPendingPhoto {
  id: string;
  ownerKeycloakSub: string;
  rawKey: string;
  mimeType: string;
}

export interface RevisablePhoto extends PendingPhoto {
  eventId: string | null;
  mediaKey: string | null;
  status: 'PENDING_UPLOAD' | 'UPLOADED' | 'READY' | 'REJECTED';
  sizeBytes: number | null;
}

export interface PersistEventChangesOptions {
  removedPhotoIds?: string[];
  enqueueReview?: boolean;
}

/**
 * Write-side port for the Event aggregate. Abstract class doubles as the Nest DI token.
 */
export abstract class EventRepository {
  /** Persists a newly created event: the event row, its location, and links its photos — in one transaction. */
  abstract save(event: Event): Promise<void>;

  /** Loads the write aggregate. Read-model queries must not use this method. */
  abstract findById(id: string): Promise<Event | null>;

  /** Persists lifecycle/media transitions for an existing aggregate. */
  abstract updateLifecycle(event: Event): Promise<void>;

  /** Persists an owner-driven revision/lifecycle transition with optimistic concurrency. */
  abstract update(event: Event, options?: PersistEventChangesOptions): Promise<void>;

  /** Photo rows owned by `ownerSub`, not yet linked to an event, still PENDING_UPLOAD. */
  abstract findPendingPhotosByIds(ids: string[], ownerSub: string): Promise<PendingPhoto[]>;

  abstract findPhotosForRevision(ids: string[], ownerSub: string, eventId: string): Promise<RevisablePhoto[]>;

  abstract createPendingPhotos(photos: NewPendingPhoto[]): Promise<void>;
}
