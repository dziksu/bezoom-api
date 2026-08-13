import { BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { EventCommentRepository } from '../../../domain/comments/event-comment.repository';
import {
  EventEngagementRepository,
  isEventAvailableForEngagement
} from '../../../domain/engagement/event-engagement.repository';
import type { EventCommentDto } from '../../dto/event-social.dto';
import { toEventCommentDto } from '../../comments/comment-response.mapper';
import { CreateEventCommentCommand } from './create-event-comment.command';
import { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';

type EventAvailabilityReader = Pick<EventEngagementRepository, 'findEventForEngagement'>;

@CommandHandler(CreateEventCommentCommand)
export class CreateEventCommentHandler implements ICommandHandler<CreateEventCommentCommand, EventCommentDto> {
  constructor(
    private readonly comments: EventCommentRepository,
    @Inject(EventEngagementRepository)
    private readonly engagement: EventAvailabilityReader,
    private readonly blocks: UserBlockRepository
  ) {}

  async execute(command: CreateEventCommentCommand): Promise<EventCommentDto> {
    const body = command.body.trim();
    if (body.length === 0 || body.length > 500) throw new BadRequestException('COMMENT_BODY_INVALID');

    const event = await this.engagement.findEventForEngagement(command.eventId);
    if (!event || !isEventAvailableForEngagement(event)) throw new NotFoundException('EVENT_NOT_FOUND');
    if (await this.blocks.isBlockedBetween(command.authorKeycloakSub, event.organizerKeycloakSub)) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }

    const comment = await this.comments.create(command.eventId, command.authorKeycloakSub, body, command.parentId);
    return toEventCommentDto(comment);
  }
}
