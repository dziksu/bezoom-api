import { AggregateRoot } from '@api/shared/domain/entities/aggregate-root';
import { DomainValidationError } from './events.errors';
import { EventPeriod } from './value-objects/event-period.vo';
import { EventLocation, type EventLocationInput } from './value-objects/event-location.vo';
import { Price, type PriceInput } from './value-objects/price.vo';
import { EventPhoto } from './event-photo.entity';
import { EventCreatedDomainEvent } from './events/event-created.domain-event';

export const EVENT_CATEGORIES = [
  'ARTS_AND_CULTURE',
  'ENTERTAINMENT',
  'SPORT_AND_RECREATION',
  'EDUCATION_AND_DEVELOPMENT',
  'SOCIAL_MEETUPS',
  'FESTIVALS_AND_FAIRS',
  'TRADE_AND_MARKETS',
  'FAMILY_AND_KIDS',
  'BUSINESS_AND_CAREER',
  'COMMUNITY_AND_ACTIVISM',
  'MUSIC_AND_NIGHTLIFE',
  'HEALTH_AND_WELLNESS',
  'FOOD_AND_CULINARY'
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_STATUSES = ['DRAFT', 'UPLOADED', 'READY', 'PUBLISHED', 'REJECTED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventVisibility = 'PUBLIC' | 'PRIVATE';
export const VERIFICATION_STATUSES = ['UNVERIFIED', 'VERIFIED', 'REJECTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const MEDIA_PIPELINE_STATUSES = ['UPLOADED', 'REJECTED', 'NEEDS_REVIEW', 'APPROVED', 'READY'] as const;
export type MediaPipelineStatus = (typeof MEDIA_PIPELINE_STATUSES)[number];

// Reach is controlled by the backend and is never accepted from a client.
// New events begin in the nearest discovery ring; later engagement policies may
// promote them through LOCAL, CITY, REGIONAL and NATIONAL reach.
export const NEARBY_EVENT_REACH_RADIUS_KM = 1;
export const NATIONAL_EVENT_REACH_RADIUS_KM = 1_000;

// PRD requires 1-5 photos per event. MIN_PHOTOS is the single toggle to flip later
// if the product ever allows creating an event with zero photos.
const MIN_PHOTOS = 1;
const MAX_PHOTOS = 5;
const MIN_DESCRIPTION_LENGTH = 50;
const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 120;

export interface CreateEventInput {
  title: string;
  description: string;
  category: EventCategory;
  startDate: Date;
  endDate?: Date;
  organizerKeycloakSub: string;
  submittedByIsOrganizer?: boolean;
  location: EventLocationInput;
  price: PriceInput;
  amenities?: string[];
  photos: Array<{ id: string; rawKey: string; mimeType: string; sizeBytes: number }>;
}

export interface ReviseEventInput {
  submittedByIsOrganizer?: boolean;
  title: string;
  description: string;
  category: EventCategory;
  startDate: Date;
  endDate?: Date;
  location: EventLocationInput;
  price: PriceInput;
  amenities: string[];
  photos: EventPhoto[];
}

export interface EventProps {
  title: string;
  description: string;
  category: EventCategory;
  period: EventPeriod;
  organizerKeycloakSub: string;
  submittedByIsOrganizer: boolean;
  location: EventLocation;
  price: Price;
  amenities: string[];
  photos: EventPhoto[];
  status: EventStatus;
  mediaPipelineStatus: MediaPipelineStatus;
  visibility: EventVisibility;
  radiusKm: number;
  verificationStatus: VerificationStatus;
  verificationRejectionReason?: string;
  verifiedAt?: Date;
  archivedAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Event extends AggregateRoot<EventProps> {
  private constructor(props: EventProps, id: string) {
    super(props, id);
  }

  /** Creates an uploaded event awaiting moderation and media processing. */
  static create(input: CreateEventInput, id: string): Event {
    if (input.title.trim().length < MIN_TITLE_LENGTH || input.title.length > MAX_TITLE_LENGTH) {
      throw new DomainValidationError('EVENT_TITLE_INVALID');
    }
    if (input.description.trim().length < MIN_DESCRIPTION_LENGTH) {
      throw new DomainValidationError('EVENT_DESCRIPTION_TOO_SHORT');
    }
    if (!EVENT_CATEGORIES.includes(input.category)) {
      throw new DomainValidationError('EVENT_CATEGORY_INVALID');
    }
    if (input.photos.length < MIN_PHOTOS || input.photos.length > MAX_PHOTOS) {
      throw new DomainValidationError('EVENT_PHOTO_COUNT_INVALID');
    }

    const period = EventPeriod.create(input.startDate, input.endDate);
    const location = EventLocation.create(input.location);
    const price = Price.create(input.price);
    const photos = input.photos.map((p, index) =>
      EventPhoto.uploaded({
        id: p.id,
        rawKey: p.rawKey,
        position: index,
        mimeType: p.mimeType,
        sizeBytes: p.sizeBytes
      })
    );

    const now = new Date();
    const event = new Event(
      {
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category,
        period,
        organizerKeycloakSub: input.organizerKeycloakSub,
        submittedByIsOrganizer: input.submittedByIsOrganizer ?? false,
        location,
        price,
        amenities: input.amenities ?? [],
        photos,
        status: 'UPLOADED',
        mediaPipelineStatus: 'UPLOADED',
        // MVP exposes public events only. The enum remains future-ready for a
        // post-MVP access model, but no creation input can select PRIVATE.
        visibility: 'PUBLIC',
        radiusKm: NEARBY_EVENT_REACH_RADIUS_KM,
        verificationStatus: 'UNVERIFIED',
        version: 0,
        createdAt: now,
        updatedAt: now
      },
      id
    );

    event.addDomainEvent(new EventCreatedDomainEvent(event.id, event.props.organizerKeycloakSub));
    return event;
  }

  /** Reconstitute from persistence — no invariant checks, no domain events raised. */
  static reconstitute(props: EventProps, id: string): Event {
    return new Event(props, id);
  }

  verify(): void {
    this.props.verificationStatus = 'VERIFIED';
    this.props.verifiedAt = new Date();
    this.props.verificationRejectionReason = undefined;
    this.props.updatedAt = new Date();
  }

  revise(input: ReviseEventInput): void {
    if (this.props.archivedAt) throw new DomainValidationError('EVENT_ARCHIVED');
    if (this.props.status === 'CANCELLED') throw new DomainValidationError('EVENT_NOT_EDITABLE');

    if (input.title.trim().length < MIN_TITLE_LENGTH || input.title.length > MAX_TITLE_LENGTH) {
      throw new DomainValidationError('EVENT_TITLE_INVALID');
    }
    if (input.description.trim().length < MIN_DESCRIPTION_LENGTH) {
      throw new DomainValidationError('EVENT_DESCRIPTION_TOO_SHORT');
    }
    if (!EVENT_CATEGORIES.includes(input.category)) {
      throw new DomainValidationError('EVENT_CATEGORY_INVALID');
    }
    if (input.photos.length < MIN_PHOTOS || input.photos.length > MAX_PHOTOS) {
      throw new DomainValidationError('EVENT_PHOTO_COUNT_INVALID');
    }

    this.props.title = input.title.trim();
    this.props.submittedByIsOrganizer = input.submittedByIsOrganizer ?? this.props.submittedByIsOrganizer;
    this.props.description = input.description.trim();
    this.props.category = input.category;
    this.props.period = EventPeriod.create(input.startDate, input.endDate);
    this.props.location = EventLocation.create(input.location);
    this.props.price = Price.create(input.price);
    this.props.amenities = input.amenities;
    this.props.photos = input.photos;
    this.props.status = 'DRAFT';
    this.props.mediaPipelineStatus = 'UPLOADED';
    this.props.verificationStatus = 'UNVERIFIED';
    this.props.verificationRejectionReason = undefined;
    this.props.verifiedAt = undefined;
    this.props.updatedAt = new Date();
  }

  resubmit(): void {
    if (this.props.archivedAt) throw new DomainValidationError('EVENT_ARCHIVED');
    // Rejected content must be revised first. revise() clears the rejection and
    // creates a DRAFT, preventing an unchanged rejected payload from looping.
    if (this.props.status !== 'DRAFT') {
      throw new DomainValidationError('EVENT_NOT_RESUBMITTABLE');
    }
    this.props.status = 'UPLOADED';
    this.props.mediaPipelineStatus = 'UPLOADED';
    this.props.verificationStatus = 'UNVERIFIED';
    this.props.verificationRejectionReason = undefined;
    this.props.verifiedAt = undefined;
    this.props.updatedAt = new Date();
  }

  cancel(): void {
    if (this.props.archivedAt) throw new DomainValidationError('EVENT_ARCHIVED');
    if (this.props.status === 'CANCELLED') throw new DomainValidationError('EVENT_ALREADY_CANCELLED');
    this.props.status = 'CANCELLED';
    this.props.updatedAt = new Date();
  }

  archive(): void {
    if (this.props.archivedAt) return;
    const now = new Date();
    this.props.status = 'CANCELLED';
    this.props.archivedAt = now;
    this.props.updatedAt = now;
  }

  reject(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new DomainValidationError('EVENT_REJECTION_REASON_REQUIRED');
    }
    this.props.status = 'REJECTED';
    this.props.mediaPipelineStatus = 'REJECTED';
    this.props.verificationStatus = 'REJECTED';
    this.props.verificationRejectionReason = reason.trim();
    this.props.verifiedAt = undefined;
    this.props.updatedAt = new Date();
  }

  markPhotoReady(photoId: string, mediaKey: string): void {
    const photo = this.props.photos.find((candidate) => candidate.id === photoId);
    if (!photo) {
      throw new DomainValidationError('EVENT_PHOTO_NOT_FOUND');
    }
    if (!mediaKey.trim()) {
      throw new DomainValidationError('EVENT_MEDIA_KEY_REQUIRED');
    }
    photo.markReady(mediaKey.trim());
    this.props.updatedAt = new Date();
  }

  markReady(): void {
    if (this.props.verificationStatus !== 'VERIFIED') {
      throw new DomainValidationError('EVENT_NOT_READY');
    }
    if (this.props.photos.length < MIN_PHOTOS || this.props.photos.length > MAX_PHOTOS) {
      throw new DomainValidationError('EVENT_PHOTO_COUNT_INVALID');
    }
    if (this.props.photos.some((photo) => photo.status !== 'READY' || !photo.mediaKey)) {
      throw new DomainValidationError('EVENT_MEDIA_NOT_READY');
    }
    this.props.mediaPipelineStatus = 'READY';
    this.props.status = 'READY';
    this.props.updatedAt = new Date();
  }

  publish(): void {
    if (this.props.archivedAt) throw new DomainValidationError('EVENT_ARCHIVED');
    if (this.props.status === 'PUBLISHED') {
      throw new DomainValidationError('EVENT_ALREADY_PUBLISHED');
    }
    if (this.props.status !== 'READY' || this.props.mediaPipelineStatus !== 'READY') {
      throw new DomainValidationError('EVENT_NOT_READY');
    }
    this.props.status = 'PUBLISHED';
    this.props.updatedAt = new Date();
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string {
    return this.props.description;
  }

  get category(): EventCategory {
    return this.props.category;
  }

  get period(): EventPeriod {
    return this.props.period;
  }

  get organizerKeycloakSub(): string {
    return this.props.organizerKeycloakSub;
  }

  get submittedByIsOrganizer(): boolean {
    return this.props.submittedByIsOrganizer;
  }

  get location(): EventLocation {
    return this.props.location;
  }

  get price(): Price {
    return this.props.price;
  }

  get amenities(): string[] {
    return this.props.amenities;
  }

  get photos(): EventPhoto[] {
    return this.props.photos;
  }

  get status(): EventStatus {
    return this.props.status;
  }

  get mediaPipelineStatus(): MediaPipelineStatus {
    return this.props.mediaPipelineStatus;
  }

  get visibility(): EventVisibility {
    return this.props.visibility;
  }

  get radiusKm(): number {
    return this.props.radiusKm;
  }

  get verificationStatus(): VerificationStatus {
    return this.props.verificationStatus;
  }

  get verificationRejectionReason(): string | undefined {
    return this.props.verificationRejectionReason;
  }

  get verifiedAt(): Date | undefined {
    return this.props.verifiedAt;
  }

  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }

  get version(): number {
    return this.props.version;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
