import type { EventCommentRecord } from '../../domain/comments/event-comment.repository';
import type { EventCommentDto } from '../dto/event-social.dto';

export function toEventCommentDto(comment: EventCommentRecord): EventCommentDto {
  return {
    id: comment.id,
    eventId: comment.eventId,
    parentId: comment.parentId,
    body: comment.body,
    author: comment.author,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    isEdited: comment.editedAt !== undefined
  };
}
