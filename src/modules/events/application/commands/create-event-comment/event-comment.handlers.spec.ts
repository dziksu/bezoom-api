import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventCommentRecord } from '../../../domain/comments/event-comment.repository';
import { CreateEventCommentCommand } from './create-event-comment.command';
import { CreateEventCommentHandler } from './create-event-comment.handler';
import { UpdateEventCommentCommand } from '../update-event-comment/update-event-comment.command';
import { UpdateEventCommentHandler } from '../update-event-comment/update-event-comment.handler';
import { DeleteEventCommentCommand } from '../delete-event-comment/delete-event-comment.command';
import { DeleteEventCommentHandler } from '../delete-event-comment/delete-event-comment.handler';
import type { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';
import { SetEventCommentLikeCommand } from '../set-event-comment-like/set-event-comment-like.command';
import { SetEventCommentLikeHandler } from '../set-event-comment-like/set-event-comment-like.handler';

describe('event comment handlers', () => {
  const eventId = 'a0cf776e-5e07-497f-a32e-cd5eb1243312';
  const commentId = 'd45f5bb8-bf19-4a6f-bbab-61e338e12262';
  const authorSub = 'author-sub';
  const comment: EventCommentRecord = {
    id: commentId,
    eventId,
    body: 'Useful comment',
    author: { id: '7bf116b7-d9ca-498f-aabb-0e3dbaf616f5', username: 'anna' },
    mentions: [],
    likesCount: 0,
    likedByViewer: false,
    createdAt: new Date('2026-08-13T12:00:00.000Z'),
    updatedAt: new Date('2026-08-13T12:00:00.000Z')
  };

  const build = () => {
    const comments = {
      create: jest.fn().mockResolvedValue(comment),
      updateOwned: jest.fn().mockResolvedValue({ ...comment, editedAt: new Date() }),
      deleteOwned: jest.fn().mockResolvedValue(true),
      findEngagementTarget: jest.fn().mockResolvedValue({ authorKeycloakSub: authorSub }),
      setLike: jest.fn().mockResolvedValue({ liked: true, likesCount: 1 })
    };
    const engagement = {
      findEventForEngagement: jest.fn().mockResolvedValue({
        id: eventId,
        organizerKeycloakSub: 'organizer-sub',
        status: 'PUBLISHED',
        mediaPipelineStatus: 'READY',
        verificationStatus: 'VERIFIED',
        visibility: 'PUBLIC'
      })
    };
    const blocks = { isBlockedBetween: jest.fn().mockResolvedValue(false) };
    return {
      comments,
      engagement,
      blocks,
      create: new CreateEventCommentHandler(comments, engagement, blocks as unknown as UserBlockRepository),
      update: new UpdateEventCommentHandler(comments),
      delete: new DeleteEventCommentHandler(comments),
      like: new SetEventCommentLikeHandler(comments, engagement, blocks as unknown as UserBlockRepository)
    };
  };

  it('creates a trimmed comment only for a publicly available event', async () => {
    const { create, comments } = build();

    const result = await create.execute(new CreateEventCommentCommand(eventId, authorSub, '  Useful comment  '));

    expect(comments.create).toHaveBeenCalledWith(eventId, authorSub, 'Useful comment', undefined);
    expect(result).toMatchObject({ id: commentId, body: 'Useful comment', isEdited: false });
  });

  it('likes a visible comment idempotently after block checks', async () => {
    const { like, comments, blocks } = build();

    await expect(like.execute(new SetEventCommentLikeCommand(eventId, commentId, 'viewer-sub', true))).resolves.toEqual(
      {
        liked: true,
        likesCount: 1
      }
    );
    expect(blocks.isBlockedBetween).toHaveBeenCalledTimes(2);
    expect(comments.setLike).toHaveBeenCalledWith(eventId, commentId, 'viewer-sub', true);
  });

  it('rejects empty content and masks a non-public event', async () => {
    const { create, engagement } = build();
    await expect(create.execute(new CreateEventCommentCommand(eventId, authorSub, '   '))).rejects.toBeInstanceOf(
      BadRequestException
    );

    engagement.findEventForEngagement.mockResolvedValue({
      id: eventId,
      organizerKeycloakSub: 'organizer-sub',
      status: 'DRAFT',
      mediaPipelineStatus: 'UPLOADED',
      verificationStatus: 'UNVERIFIED',
      visibility: 'PUBLIC'
    });
    await expect(create.execute(new CreateEventCommentCommand(eventId, authorSub, 'Comment'))).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('masks an event when the commenter and organizer block each other', async () => {
    const { create, comments, blocks } = build();
    blocks.isBlockedBetween.mockResolvedValue(true);

    await expect(create.execute(new CreateEventCommentCommand(eventId, authorSub, 'Comment'))).rejects.toThrow(
      'EVENT_NOT_FOUND'
    );
    expect(comments.create).not.toHaveBeenCalled();
  });

  it('edits and soft-deletes only comments owned by the caller', async () => {
    const { update, delete: remove, comments } = build();

    const updated = await update.execute(new UpdateEventCommentCommand(eventId, commentId, authorSub, 'Changed'));
    await remove.execute(new DeleteEventCommentCommand(eventId, commentId, authorSub));

    expect(updated.isEdited).toBe(true);
    expect(comments.updateOwned).toHaveBeenCalledWith(eventId, commentId, authorSub, 'Changed');
    expect(comments.deleteOwned).toHaveBeenCalledWith(eventId, commentId, authorSub);
  });

  it('masks foreign or deleted comments', async () => {
    const { update, delete: remove, comments } = build();
    comments.updateOwned.mockResolvedValue(null);
    comments.deleteOwned.mockResolvedValue(false);

    await expect(
      update.execute(new UpdateEventCommentCommand(eventId, commentId, 'foreign-user', 'Changed'))
    ).rejects.toThrow('COMMENT_NOT_FOUND');
    await expect(remove.execute(new DeleteEventCommentCommand(eventId, commentId, 'foreign-user'))).rejects.toThrow(
      'COMMENT_NOT_FOUND'
    );
  });
});
