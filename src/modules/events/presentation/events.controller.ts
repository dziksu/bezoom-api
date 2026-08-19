import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, OptionalAuth } from '@api/shared/infrastructure/auth';
import type { ICurrentUser } from '@api/shared/infrastructure/auth';
import { RedisRateLimit } from '@api/shared/infrastructure/rate-limit';
import { CreateEventDto } from '../application/dto/create-event.dto';
import { RequestPhotoUploadsDto, PhotoUploadTargetDto } from '../application/dto/request-photo-uploads.dto';
import { SearchEventsQueryDto } from '../application/dto/search-events.query.dto';
import { MapEventsQueryDto } from '../application/dto/map-events.query.dto';
import { CursorQueryDto } from '../application/dto/cursor-query.dto';
import { SetRsvpDto, LikeResponseDto, SaveResponseDto, RsvpResponseDto } from '../application/dto/engagement.dto';
import {
  EventResponseDto,
  EventDetailDto,
  EventSearchResponseDto,
  CursorEventsDto,
  CursorAttendingEventsDto,
  EventLifecycleResponseDto,
  MapEventsResponseDto
} from '../application/dto/event-response.dto';
import { CreateEventCommand } from '../application/commands/create-event/create-event.command';
import { RequestPhotoUploadsCommand } from '../application/commands/request-photo-uploads/request-photo-uploads.command';
import { SetEventLikeCommand } from '../application/commands/set-event-like/set-event-like.command';
import { SetEventSaveCommand } from '../application/commands/set-event-save/set-event-save.command';
import { SetRsvpCommand } from '../application/commands/set-rsvp/set-rsvp.command';
import { PublishEventCommand } from '../application/commands/publish-event/publish-event.command';
import { UpdateEventCommand } from '../application/commands/update-event/update-event.command';
import { ResubmitEventCommand } from '../application/commands/resubmit-event/resubmit-event.command';
import { CancelEventCommand } from '../application/commands/cancel-event/cancel-event.command';
import { ArchiveEventCommand } from '../application/commands/archive-event/archive-event.command';
import { UpdateEventDto } from '../application/dto/update-event.dto';
import { SearchEventsByLocationQuery } from '../application/queries/search-events-by-location/search-events-by-location.query';
import { GetMapEventsQuery } from '../application/queries/get-map-events/get-map-events.query';
import { GetEventByIdQuery } from '../application/queries/get-event-by-id/get-event-by-id.query';
import { ListMyCreatedEventsQuery } from '../application/queries/list-my-created-events/list-my-created-events.query';
import { ListMyAttendingEventsQuery } from '../application/queries/list-my-attending-events/list-my-attending-events.query';
import { ListMyLikedEventsQuery } from '../application/queries/list-my-liked-events/list-my-liked-events.query';
import { ListMySavedEventsQuery } from '../application/queries/list-my-saved-events/list-my-saved-events.query';

@ApiTags('Events')
@ApiBearerAuth('JWT-auth')
@Controller('events')
export class EventsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  // ── Creation ────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Create an event',
    description:
      'Creates an uploaded event awaiting moderation. Photos must first be uploaded via POST /events/photos/upload-urls.'
  })
  @ApiResponse({ status: 201, description: 'Event created', type: EventResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input or photos not uploaded' })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  @RedisRateLimit(
    { name: 'event_create_user', limit: 10, windowSeconds: 60, scopes: ['user'] },
    { name: 'event_create_ip', limit: 100, windowSeconds: 60, scopes: ['ip'] }
  )
  async createEvent(@CurrentUser() user: ICurrentUser, @Body() dto: CreateEventDto): Promise<EventResponseDto> {
    return this.commandBus.execute(
      new CreateEventCommand(
        user.id,
        dto.title,
        dto.description,
        dto.category,
        dto.startDate,
        dto.location,
        dto.priceType,
        dto.photoIds,
        dto.submittedByIsOrganizer ?? false,
        dto.endDate,
        dto.priceMin,
        dto.priceMax,
        dto.currency,
        dto.ticketUrl,
        dto.priceNotes,
        dto.amenities
      )
    );
  }

  @ApiOperation({
    summary: 'Request presigned photo upload URLs',
    description:
      'Returns one presigned MinIO PUT URL per requested file. Upload directly to each URL, then pass the returned photoIds to POST /events.'
  })
  @ApiResponse({ status: 201, description: 'Upload URLs generated', type: [PhotoUploadTargetDto] })
  @HttpCode(HttpStatus.CREATED)
  @Post('photos/upload-urls')
  @RedisRateLimit(
    { name: 'event_photo_upload_url_user', limit: 10, windowSeconds: 60, scopes: ['user'] },
    { name: 'event_photo_upload_url_ip', limit: 100, windowSeconds: 60, scopes: ['ip'] }
  )
  async requestPhotoUploads(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: RequestPhotoUploadsDto
  ): Promise<PhotoUploadTargetDto[]> {
    return this.commandBus.execute(new RequestPhotoUploadsCommand(user.id, dto.files));
  }

  @ApiOperation({
    summary: 'Publish my event',
    description: 'Publishes an event only after moderation/media processing is READY and the phone is verified.'
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Event published', type: EventLifecycleResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 409, description: 'Event or organizer is not ready for publication' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  async publishEvent(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EventLifecycleResponseDto> {
    return this.commandBus.execute(new PublishEventCommand(id, user.id));
  }

  @ApiOperation({
    summary: 'Edit my event',
    description:
      'Saves a new draft revision. A published event is removed from discovery until it is resubmitted, processed and published again.'
  })
  @ApiResponse({ status: 200, description: 'Revision saved as draft', type: EventLifecycleResponseDto })
  @HttpCode(HttpStatus.OK)
  @Patch(':id')
  @RedisRateLimit({ name: 'event_update_user', limit: 20, windowSeconds: 60, scopes: ['user'] })
  async updateEvent(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto
  ): Promise<EventLifecycleResponseDto> {
    return this.commandBus.execute(new UpdateEventCommand(id, user.id, dto));
  }

  @ApiOperation({
    summary: 'Resubmit my draft for moderation',
    description: 'A rejected event must first be revised with PATCH /events/:id.'
  })
  @ApiResponse({ status: 200, description: 'Event queued for review', type: EventLifecycleResponseDto })
  @HttpCode(HttpStatus.OK)
  @Post(':id/resubmit')
  @RedisRateLimit({ name: 'event_resubmit_user', limit: 10, windowSeconds: 60, scopes: ['user'] })
  async resubmitEvent(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EventLifecycleResponseDto> {
    return this.commandBus.execute(new ResubmitEventCommand(id, user.id));
  }

  @ApiOperation({
    summary: 'Cancel my event',
    description: 'Keeps the event for owner history but removes it from public APIs.'
  })
  @ApiResponse({ status: 200, description: 'Event cancelled', type: EventLifecycleResponseDto })
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  async cancelEvent(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EventLifecycleResponseDto> {
    return this.commandBus.execute(new CancelEventCommand(id, user.id));
  }

  @ApiOperation({
    summary: 'Archive my event',
    description:
      'Soft-deletes the event. Data remains in storage for integrity/audit but disappears from owner and public APIs.'
  })
  @ApiResponse({ status: 204, description: 'Event archived' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async archiveEvent(@CurrentUser() user: ICurrentUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.commandBus.execute(new ArchiveEventCommand(id, user.id));
  }

  // ── Discovery / read (declared before /:id so static paths win) ──────────

  @ApiOperation({
    summary: 'Get event pins for a map viewport',
    description:
      'Returns city, regional and national pins at country zoom. Local pins join from regional zoom onward. Pins are never clustered. This endpoint is viewport-based and intentionally has no text-search parameter.'
  })
  @ApiResponse({ status: 200, description: 'Map pins and exact visible total', type: MapEventsResponseDto })
  @OptionalAuth()
  @Get('map')
  async getMapEvents(
    @Query() query: MapEventsQueryDto,
    @CurrentUser() user?: ICurrentUser
  ): Promise<MapEventsResponseDto> {
    return this.queryBus.execute(
      new GetMapEventsQuery(query.west, query.south, query.east, query.north, query.zoom, query.week, user?.id)
    );
  }

  @ApiOperation({
    summary: 'Search events by location',
    description:
      'Returns published, verified, public events visible at (lat, lng), ordered by distance. Reach is assigned by the backend. Optionally filter by week (0 = current Warsaw week, 1 = next week, ...).'
  })
  @ApiResponse({ status: 200, description: 'Matching events', type: EventSearchResponseDto })
  @OptionalAuth()
  @Get('search')
  async searchEvents(
    @Query() query: SearchEventsQueryDto,
    @CurrentUser() user?: ICurrentUser
  ): Promise<EventSearchResponseDto> {
    return this.queryBus.execute(
      new SearchEventsByLocationQuery(query.lat, query.lng, query.week, query.cursor, query.limit ?? 20, user?.id)
    );
  }

  @ApiOperation({ summary: 'List events I created', description: 'Events organized by the current user (any status).' })
  @ApiResponse({ status: 200, description: 'My created events', type: CursorEventsDto })
  @Get('me/created')
  async listMyCreated(@CurrentUser() user: ICurrentUser, @Query() query: CursorQueryDto): Promise<CursorEventsDto> {
    return this.queryBus.execute(new ListMyCreatedEventsQuery(user.id, query.cursor, query.limit ?? 20));
  }

  @ApiOperation({
    summary: 'List events I am attending',
    description: 'Events the current user has RSVP’d to, including their RSVP status.'
  })
  @ApiResponse({ status: 200, description: 'My attendance', type: CursorAttendingEventsDto })
  @Get('me/attending')
  async listMyAttending(
    @CurrentUser() user: ICurrentUser,
    @Query() query: CursorQueryDto
  ): Promise<CursorAttendingEventsDto> {
    return this.queryBus.execute(new ListMyAttendingEventsQuery(user.id, query.cursor, query.limit ?? 20));
  }

  @ApiOperation({ summary: 'List events I liked' })
  @ApiResponse({ status: 200, description: 'My liked events', type: CursorEventsDto })
  @Get('me/liked')
  async listMyLiked(@CurrentUser() user: ICurrentUser, @Query() query: CursorQueryDto): Promise<CursorEventsDto> {
    return this.queryBus.execute(new ListMyLikedEventsQuery(user.id, query.cursor, query.limit ?? 20));
  }

  @ApiOperation({ summary: 'List events I saved' })
  @ApiResponse({ status: 200, description: 'My saved events', type: CursorEventsDto })
  @Get('me/saved')
  async listMySaved(@CurrentUser() user: ICurrentUser, @Query() query: CursorQueryDto): Promise<CursorEventsDto> {
    return this.queryBus.execute(new ListMySavedEventsQuery(user.id, query.cursor, query.limit ?? 20));
  }

  @ApiOperation({
    summary: 'Get an event by id',
    description: 'Full event detail including photos and engagement counts.'
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Event detail', type: EventDetailDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @OptionalAuth()
  @Get(':id')
  async getEventById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: ICurrentUser
  ): Promise<EventDetailDto> {
    return this.queryBus.execute(new GetEventByIdQuery(id, user?.id));
  }

  // ── Engagement (like / save / RSVP) ──────────────────────────────────────

  @ApiOperation({ summary: 'Like an event' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Event liked', type: LikeResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/like')
  async likeEvent(@CurrentUser() user: ICurrentUser, @Param('id', ParseUUIDPipe) id: string): Promise<LikeResponseDto> {
    return this.commandBus.execute(new SetEventLikeCommand(id, user.id, true));
  }

  @ApiOperation({ summary: 'Remove a like from an event' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Like removed', type: LikeResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Delete(':id/like')
  async unlikeEvent(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<LikeResponseDto> {
    return this.commandBus.execute(new SetEventLikeCommand(id, user.id, false));
  }

  @ApiOperation({ summary: 'Save an event' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Event saved', type: SaveResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/save')
  async saveEvent(@CurrentUser() user: ICurrentUser, @Param('id', ParseUUIDPipe) id: string): Promise<SaveResponseDto> {
    return this.commandBus.execute(new SetEventSaveCommand(id, user.id, true));
  }

  @ApiOperation({ summary: 'Remove a save from an event' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Save removed', type: SaveResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Delete(':id/save')
  async unsaveEvent(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<SaveResponseDto> {
    return this.commandBus.execute(new SetEventSaveCommand(id, user.id, false));
  }

  @ApiOperation({
    summary: 'Join an event / set RSVP status',
    description: 'Creates or updates the current user’s RSVP (MAYBE / CONFIRMED / DECLINED).'
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'RSVP set', type: RsvpResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 409, description: 'Event is cancelled' })
  @HttpCode(HttpStatus.OK)
  @Put(':id/rsvp')
  async setRsvp(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRsvpDto
  ): Promise<RsvpResponseDto> {
    return this.commandBus.execute(new SetRsvpCommand(id, user.id, dto.status));
  }

  @ApiOperation({ summary: 'Cancel my RSVP (leave the event)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'RSVP cancelled', type: RsvpResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Delete(':id/rsvp')
  async cancelRsvp(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<RsvpResponseDto> {
    return this.commandBus.execute(new SetRsvpCommand(id, user.id, null));
  }
}
