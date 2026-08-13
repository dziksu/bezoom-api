import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { EventCommentRepository } from '../../../domain/comments/event-comment.repository';
import type { EventCommentDto } from '../../dto/event-social.dto';
import { toEventCommentDto } from '../../comments/comment-response.mapper';
import { UpdateEventCommentCommand } from './update-event-comment.command';

@CommandHandler(UpdateEventCommentCommand)
export class UpdateEventCommentHandler implements ICommandHandler<UpdateEventCommentCommand, EventCommentDto> {
  constructor(private readonly comments: EventCommentRepository) {}

  async execute(command: UpdateEventCommentCommand): Promise<EventCommentDto> {
    const body = command.body.trim();
    if (body.length === 0 || body.length > 500) throw new BadRequestException('COMMENT_BODY_INVALID');

    const comment = await this.comments.updateOwned(
      command.eventId,
      command.commentId,
      command.authorKeycloakSub,
      body
    );
    if (!comment) throw new NotFoundException('COMMENT_NOT_FOUND');
    return toEventCommentDto(comment);
  }
}
