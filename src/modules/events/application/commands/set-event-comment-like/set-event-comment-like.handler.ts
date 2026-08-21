import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';
import { EventCommentRepository } from '../../../domain/comments/event-comment.repository';
import {
  EventEngagementRepository,
  isEventAvailableForEngagement
} from '../../../domain/engagement/event-engagement.repository';
import type { CommentLikeResponseDto } from '../../dto/event-social.dto';
import { SetEventCommentLikeCommand } from './set-event-comment-like.command';

type EventAvailabilityReader = Pick<EventEngagementRepository, 'findEventForEngagement'>;

@CommandHandler(SetEventCommentLikeCommand)
export class SetEventCommentLikeHandler implements ICommandHandler<SetEventCommentLikeCommand, CommentLikeResponseDto> {
  constructor(
    private readonly comments: EventCommentRepository,
    @Inject(EventEngagementRepository)
    private readonly engagement: EventAvailabilityReader,
    private readonly blocks: UserBlockRepository
  ) {}

  async execute(command: SetEventCommentLikeCommand): Promise<CommentLikeResponseDto> {
    const [event, target] = await Promise.all([
      this.engagement.findEventForEngagement(command.eventId),
      this.comments.findEngagementTarget(command.eventId, command.commentId)
    ]);
    if (!event || !isEventAvailableForEngagement(event) || !target) {
      throw new NotFoundException('COMMENT_NOT_FOUND');
    }
    const blocked = await Promise.all([
      this.blocks.isBlockedBetween(command.actorKeycloakSub, event.organizerKeycloakSub),
      this.blocks.isBlockedBetween(command.actorKeycloakSub, target.authorKeycloakSub)
    ]);
    if (blocked.some(Boolean)) throw new NotFoundException('COMMENT_NOT_FOUND');

    const result = await this.comments.setLike(
      command.eventId,
      command.commentId,
      command.actorKeycloakSub,
      command.liked
    );
    if (!result) throw new NotFoundException('COMMENT_NOT_FOUND');
    return result;
  }
}
