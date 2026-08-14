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
  Query
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, OptionalAuth } from '@api/shared/infrastructure/auth';
import type { ICurrentUser } from '@api/shared/infrastructure/auth';
import { RedisRateLimit } from '@api/shared/infrastructure/rate-limit';
import { CursorQueryDto } from '../application/dto/cursor-query.dto';
import {
  CreateEventCommentDto,
  CursorEventActorsDto,
  CursorEventCommentsDto,
  EventCommentDto,
  UpdateEventCommentDto
} from '../application/dto/event-social.dto';
import { CreateEventCommentCommand } from '../application/commands/create-event-comment/create-event-comment.command';
import { UpdateEventCommentCommand } from '../application/commands/update-event-comment/update-event-comment.command';
import { DeleteEventCommentCommand } from '../application/commands/delete-event-comment/delete-event-comment.command';
import {
  ListEventCommentsQuery,
  ListEventLikesQuery,
  ListEventParticipantsQuery
} from '../application/queries/list-event-social/list-event-social.queries';

@ApiTags('Event social')
@ApiBearerAuth('JWT-auth')
@Controller('events/:eventId')
export class EventCommentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  @ApiOperation({ summary: 'Load the next comments batch' })
  @ApiResponse({ status: 200, type: CursorEventCommentsDto })
  @OptionalAuth()
  @Get('comments')
  listComments(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: CursorQueryDto,
    @CurrentUser() user?: ICurrentUser
  ): Promise<CursorEventCommentsDto> {
    return this.queryBus.execute(new ListEventCommentsQuery(eventId, query.cursor, query.limit ?? 20, user?.id));
  }

  @ApiOperation({ summary: 'Add an event comment or one-level reply' })
  @ApiResponse({ status: 201, type: EventCommentDto })
  @Post('comments')
  @RedisRateLimit(
    { name: 'event_comment_create_user', limit: 1, windowSeconds: 1, scopes: ['user'] },
    { name: 'event_comment_create_ip', limit: 30, windowSeconds: 60, scopes: ['ip'] }
  )
  createComment(
    @CurrentUser() user: ICurrentUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateEventCommentDto
  ): Promise<EventCommentDto> {
    return this.commandBus.execute(new CreateEventCommentCommand(eventId, user.id, dto.body, dto.parentId));
  }

  @ApiOperation({ summary: 'Edit my comment' })
  @ApiResponse({ status: 200, type: EventCommentDto })
  @Patch('comments/:commentId')
  @RedisRateLimit({ name: 'event_comment_update_user', limit: 20, windowSeconds: 60, scopes: ['user'] })
  updateComment(
    @CurrentUser() user: ICurrentUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: UpdateEventCommentDto
  ): Promise<EventCommentDto> {
    return this.commandBus.execute(new UpdateEventCommentCommand(eventId, commentId, user.id, dto.body));
  }

  @ApiOperation({ summary: 'Delete my comment' })
  @ApiResponse({ status: 204 })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('comments/:commentId')
  deleteComment(
    @CurrentUser() user: ICurrentUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string
  ): Promise<void> {
    return this.commandBus.execute(new DeleteEventCommentCommand(eventId, commentId, user.id));
  }

  @ApiOperation({ summary: 'Load public profiles that liked the event' })
  @ApiResponse({ status: 200, type: CursorEventActorsDto })
  @OptionalAuth()
  @Get('likes')
  listLikes(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: CursorQueryDto,
    @CurrentUser() user?: ICurrentUser
  ): Promise<CursorEventActorsDto> {
    return this.queryBus.execute(new ListEventLikesQuery(eventId, query.cursor, query.limit ?? 20, user?.id));
  }

  @ApiOperation({ summary: 'Load public confirmed participants' })
  @ApiResponse({ status: 200, type: CursorEventActorsDto })
  @OptionalAuth()
  @Get('participants')
  listParticipants(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: CursorQueryDto,
    @CurrentUser() user?: ICurrentUser
  ): Promise<CursorEventActorsDto> {
    return this.queryBus.execute(new ListEventParticipantsQuery(eventId, query.cursor, query.limit ?? 20, user?.id));
  }
}
