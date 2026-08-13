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

/**
 * Write-side port for the Event aggregate. Abstract class doubles as the Nest DI token.
 */
export abstract class EventRepository {
  /** Persists a newly created event: the event row, its location, and links its photos — in one transaction. */
  abstract save(event: Event): Promise<void>;

  /** Photo rows owned by `ownerSub`, not yet linked to an event, still PENDING_UPLOAD. */
  abstract findPendingPhotosByIds(ids: string[], ownerSub: string): Promise<PendingPhoto[]>;

  abstract createPendingPhotos(photos: NewPendingPhoto[]): Promise<void>;
}
