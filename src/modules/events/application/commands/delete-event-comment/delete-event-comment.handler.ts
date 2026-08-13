import { NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { EventCommentRepository } from '../../../domain/comments/event-comment.repository';
import { DeleteEventCommentCommand } from './delete-event-comment.command';

@CommandHandler(DeleteEventCommentCommand)
export class DeleteEventCommentHandler implements ICommandHandler<DeleteEventCommentCommand, void> {
  constructor(private readonly comments: EventCommentRepository) {}

  async execute(command: DeleteEventCommentCommand): Promise<void> {
    const deleted = await this.comments.deleteOwned(command.eventId, command.commentId, command.authorKeycloakSub);
    if (!deleted) throw new NotFoundException('COMMENT_NOT_FOUND');
  }
}
