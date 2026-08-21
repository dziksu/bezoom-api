import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  MEDIA_PIPELINE_STATUSES,
  VERIFICATION_STATUSES,
  type EventCategory,
  type EventStatus,
  type MediaPipelineStatus,
  type VerificationStatus
} from '../../domain/event.aggregate';
import { RSVP_STATUSES, type RsvpStatus } from '../../domain/engagement/rsvp-status';
import { PRICE_TYPES, type PriceType } from '../../domain/value-objects/price.vo';

export class EventPhotoResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  position: number;
}

export class EventCreatorResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['personal', 'business'] })
  accountType: 'personal' | 'business';

  @ApiProperty({ required: false })
  username?: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ required: false })
  avatarUrl?: string;

  @ApiProperty()
  followersCount: number;
}

export class EventResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: EVENT_CATEGORIES })
  category: EventCategory;

  @ApiProperty()
  startDate: Date;

  @ApiProperty({ required: false })
  endDate?: Date;

  @ApiPropertyOptional({ deprecated: true, description: 'Deprecated alias of creatorId.' })
  organizerId?: string;

  @ApiPropertyOptional({ description: 'Public profile id of the person who submitted the event.' })
  creatorId?: string;

  @ApiPropertyOptional({ type: EventCreatorResponseDto })
  creator?: EventCreatorResponseDto;

  @ApiProperty({
    description: 'Whether the submitter declared that they are also the organizer. Ownership is independent.'
  })
  submittedByIsOrganizer: boolean;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ required: false })
  address?: string;

  @ApiProperty({ required: false })
  city?: string;

  @ApiProperty()
  country: string;

  @ApiProperty({ enum: PRICE_TYPES })
  priceType: PriceType;

  @ApiProperty({ required: false })
  priceMin?: number;

  @ApiProperty({ required: false })
  priceMax?: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ required: false })
  ticketUrl?: string;

  @ApiProperty({ required: false })
  priceNotes?: string;

  @ApiProperty({ type: [String] })
  amenities: string[];

  @ApiProperty({ type: [EventPhotoResponseDto] })
  photos: EventPhotoResponseDto[];

  @ApiProperty({ enum: EVENT_STATUSES })
  status: EventStatus;

  @ApiProperty({ enum: VERIFICATION_STATUSES })
  verificationStatus: VerificationStatus;

  @ApiProperty({ required: false })
  verificationRejectionReason?: string;

  @ApiProperty()
  createdAt: Date;
}

export class EventLifecycleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: EVENT_STATUSES })
  status: EventStatus;

  @ApiProperty({ enum: MEDIA_PIPELINE_STATUSES })
  mediaPipelineStatus: MediaPipelineStatus;

  @ApiProperty({ enum: VERIFICATION_STATUSES })
  verificationStatus: VerificationStatus;

  @ApiPropertyOptional()
  archivedAt?: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class EventSearchResultDto extends EventResponseDto {
  @ApiProperty({ description: 'Distance from the search origin, in kilometers' })
  distanceKm: number;

  @ApiProperty({ required: false, description: 'URL of the event cover photo, if any' })
  coverPhotoUrl?: string;
}

export class EventSearchResponseDto {
  @ApiProperty({ type: [EventSearchResultDto] })
  items: EventSearchResultDto[];

  @ApiProperty({
    description: 'Whether another batch exists. Geo discovery deliberately avoids an exact count on its hot path.'
  })
  hasMore: boolean;

  @ApiPropertyOptional({ description: 'Pass this opaque value as cursor to load the next batch.' })
  nextCursor?: string;
}

/** Compact map representation. Full event data is loaded from GET /events/:id. */
export class MapEventPinDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'Public URL of the required event cover photo.' })
  coverPhotoUrl: string;

  @ApiProperty({ enum: EVENT_CATEGORIES })
  category: EventCategory;

  @ApiProperty()
  startDate: Date;

  @ApiPropertyOptional()
  endDate?: Date;

  @ApiPropertyOptional({ deprecated: true, description: 'Deprecated alias of creatorId.' })
  organizerId?: string;

  @ApiPropertyOptional()
  creatorId?: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiPropertyOptional()
  address?: string;

  @ApiPropertyOptional()
  city?: string;

  @ApiProperty()
  country: string;

  @ApiProperty({ description: 'Distance from the viewport centre, in kilometres.' })
  distanceKm: number;

  @ApiProperty({ description: 'Configured event reach in kilometres.' })
  reachKm: number;

  @ApiProperty({ enum: ['NEARBY', 'LOCAL', 'CITY', 'REGIONAL', 'NATIONAL'] })
  visibilityLevel: 'NEARBY' | 'LOCAL' | 'CITY' | 'REGIONAL' | 'NATIONAL';
}

export class MapClusterBoundsDto {
  @ApiProperty()
  west: number;

  @ApiProperty()
  south: number;

  @ApiProperty()
  east: number;

  @ApiProperty()
  north: number;
}

export class MapEventClusterDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ description: 'Exact number of events represented by this cluster.' })
  count: number;

  @ApiProperty({ type: MapClusterBoundsDto })
  bounds: MapClusterBoundsDto;
}

export class MapEventsResponseDto {
  @ApiProperty({
    type: [MapEventPinDto],
    description: 'Compact event pins visible at this zoom, ordered by reach. The frontend owns pin presentation.'
  })
  events: MapEventPinDto[];

  @ApiProperty({
    type: [MapEventClusterDto],
    deprecated: true,
    description: 'Deprecated compatibility field. Map events are not clustered by the API.'
  })
  clusters: MapEventClusterDto[];

  @ApiProperty({
    description: 'Exact number of eligible events in the visible viewport, including lower-reach events.'
  })
  totalCount: number;

  @ApiProperty({ description: 'Number of event pins returned at the current zoom.' })
  returnedCount: number;

  @ApiProperty({ description: 'Number of events represented by returned pins.' })
  representedCount: number;

  @ApiProperty({ description: 'Minimum reach in kilometres returned at this zoom.' })
  individualReachKm: number;

  @ApiProperty()
  zoom: number;
}

export class EventDetailDto extends EventResponseDto {
  @ApiProperty()
  likesCount: number;

  @ApiProperty()
  savesCount: number;

  @ApiProperty({ description: 'Number of CONFIRMED participants' })
  attendingCount: number;

  @ApiProperty({ description: 'Eventually-consistent number of comments' })
  commentsCount: number;
}

export class AttendingEventDto extends EventResponseDto {
  @ApiProperty({ enum: RSVP_STATUSES, description: "The current user's RSVP status for this event" })
  myRsvpStatus: RsvpStatus;
}

export class MyEventStatsDto {
  @ApiProperty({ description: 'Exact number of non-archived events created by the current user' })
  created: number;

  @ApiProperty({ description: 'Exact number of visible events the current user is attending' })
  attending: number;

  @ApiProperty({ description: 'Exact number of visible events saved by the current user' })
  saved: number;
}

export class EventViewerStateDto {
  @ApiProperty()
  liked: boolean;

  @ApiProperty()
  saved: boolean;

  @ApiProperty({ enum: ['MAYBE', 'CONFIRMED', 'DECLINED'], nullable: true })
  rsvpStatus: 'MAYBE' | 'CONFIRMED' | 'DECLINED' | null;
}

export class CursorEventsDto {
  @ApiProperty({ type: [EventResponseDto] })
  items: EventResponseDto[];

  @ApiProperty()
  hasMore: boolean;

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class CursorAttendingEventsDto {
  @ApiProperty({ type: [AttendingEventDto] })
  items: AttendingEventDto[];

  @ApiProperty()
  hasMore: boolean;

  @ApiPropertyOptional()
  nextCursor?: string;
}
