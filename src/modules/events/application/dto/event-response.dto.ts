import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty()
  organizerKeycloakSub: string;

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
  visibility: string;

  @ApiProperty()
  verificationStatus: string;

  @ApiProperty({ required: false })
  verificationRejectionReason?: string;

  @ApiProperty()
  createdAt: Date;
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

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;
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

export class PaginatedEventsDto {
  @ApiProperty({ type: [EventResponseDto] })
  items: EventResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;
}

export class PaginatedAttendingEventsDto {
  @ApiProperty({ type: [AttendingEventDto] })
  items: AttendingEventDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;
}
