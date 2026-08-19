import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiProperty()
  category: string;

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

  @ApiProperty()
  priceType: string;

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

  @ApiProperty()
  status: string;

  @ApiProperty()
  verificationStatus: string;

  @ApiProperty({ required: false })
  verificationRejectionReason?: string;

  @ApiProperty()
  createdAt: Date;
}

export class EventLifecycleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  mediaPipelineStatus: string;

  @ApiProperty()
  verificationStatus: string;

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

export class MapEventPinDto extends EventSearchResultDto {
  @ApiProperty({ description: 'Configured event reach in kilometres.' })
  reachKm: number;

  @ApiProperty({ enum: ['LOCAL', 'CITY', 'REGIONAL', 'NATIONAL'] })
  visibilityLevel: 'LOCAL' | 'CITY' | 'REGIONAL' | 'NATIONAL';
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
  @ApiProperty({ type: [MapEventPinDto], description: 'Events visible at this zoom, ordered by reach.' })
  events: MapEventPinDto[];

  @ApiProperty({ type: [MapEventClusterDto], description: 'Deprecated; map events are no longer clustered.' })
  clusters: MapEventClusterDto[];

  @ApiProperty({ description: 'Exact number of events returned for the viewport and zoom.' })
  totalCount: number;

  @ApiProperty({ description: 'Deprecated compatibility field; equals totalCount.' })
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
  @ApiProperty({ description: "The current user's RSVP status for this event" })
  myRsvpStatus: string;
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
