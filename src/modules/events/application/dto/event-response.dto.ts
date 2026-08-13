import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EventPhotoResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  position: number;
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

  @ApiPropertyOptional({ description: 'Public profile id of the organizer.' })
  organizerId?: string;

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
