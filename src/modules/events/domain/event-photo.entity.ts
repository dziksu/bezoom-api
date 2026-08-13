export type EventPhotoStatus = 'PENDING_UPLOAD' | 'UPLOADED' | 'READY' | 'REJECTED';

export interface EventPhotoProps {
  id: string;
  rawKey: string;
  mediaKey?: string;
  position: number;
  mimeType: string;
  sizeBytes?: number;
  status: EventPhotoStatus;
}

/** Child entity of the Event aggregate — not independently persisted/loaded. */
export class EventPhoto {
  private constructor(private readonly props: EventPhotoProps) {}

  static uploaded(input: {
    id: string;
    rawKey: string;
    position: number;
    mimeType: string;
    sizeBytes: number;
  }): EventPhoto {
    return new EventPhoto({ ...input, status: 'UPLOADED' });
  }

  /** Reconstitutes a persisted child without replaying creation invariants. */
  static reconstitute(props: EventPhotoProps): EventPhoto {
    return new EventPhoto(props);
  }

  markReady(mediaKey: string): void {
    this.props.mediaKey = mediaKey;
    this.props.status = 'READY';
  }

  get id(): string {
    return this.props.id;
  }

  get rawKey(): string {
    return this.props.rawKey;
  }

  get mediaKey(): string | undefined {
    return this.props.mediaKey;
  }

  get position(): number {
    return this.props.position;
  }

  get mimeType(): string {
    return this.props.mimeType;
  }

  get sizeBytes(): number | undefined {
    return this.props.sizeBytes;
  }

  get status(): EventPhotoStatus {
    return this.props.status;
  }
}
