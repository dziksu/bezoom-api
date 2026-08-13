import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { SetEventLikeHandler } from './set-event-like.handler';
import { SetEventLikeCommand } from './set-event-like.command';
import type { EventEngagementRepository } from '../../../domain/engagement/event-engagement.repository';

describe('SetEventLikeHandler', () => {
  const buildHandler = (eventExists: boolean) => {
    const repo = {
      findEventForEngagement: jest.fn().mockResolvedValue(
        eventExists
          ? {
              id: 'e',
              status: 'PUBLISHED',
              visibility: 'PUBLIC',
              verificationStatus: 'VERIFIED',
              mediaPipelineStatus: 'READY'
            }
          : null
      ),
      setLike: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockResolvedValue({ likesCount: 5, savesCount: 0, attendingCount: 0, commentsCount: 0 })
    };

    return { handler: new SetEventLikeHandler(repo as unknown as EventEngagementRepository), repo };
  };

  it('likes an existing event and returns the updated count', async () => {
    const { handler, repo } = buildHandler(true);
    const id = randomUUID();

    const result = await handler.execute(new SetEventLikeCommand(id, 'sub-1', true));

    expect(repo.setLike).toHaveBeenCalledWith(id, 'sub-1', true);
    expect(result).toEqual({ liked: true, likesCount: 5 });
  });

  it('unlikes when liked is false', async () => {
    const { handler, repo } = buildHandler(true);
    const id = randomUUID();

    const result = await handler.execute(new SetEventLikeCommand(id, 'sub-1', false));

    expect(repo.setLike).toHaveBeenCalledWith(id, 'sub-1', false);
    expect(result.liked).toBe(false);
  });

  it('throws NotFound when the event does not exist', async () => {
    const { handler, repo } = buildHandler(false);

    await expect(handler.execute(new SetEventLikeCommand(randomUUID(), 'sub-1', true))).rejects.toThrow(
      NotFoundException
    );
    expect(repo.setLike).not.toHaveBeenCalled();
  });

  it('conceals an event which is not publicly available', async () => {
    const { handler, repo } = buildHandler(true);
    repo.findEventForEngagement.mockResolvedValue({
      id: 'e',
      status: 'UPLOADED',
      visibility: 'PUBLIC',
      verificationStatus: 'UNVERIFIED',
      mediaPipelineStatus: 'UPLOADED'
    });

    await expect(handler.execute(new SetEventLikeCommand(randomUUID(), 'sub-1', true))).rejects.toThrow(
      'EVENT_NOT_FOUND'
    );
    expect(repo.setLike).not.toHaveBeenCalled();
  });
});
