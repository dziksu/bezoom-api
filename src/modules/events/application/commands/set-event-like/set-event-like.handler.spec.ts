import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { SetEventLikeHandler } from './set-event-like.handler';
import { SetEventLikeCommand } from './set-event-like.command';
import type { EventEngagementRepository } from '../../../domain/engagement/event-engagement.repository';
import type { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';

describe('SetEventLikeHandler', () => {
  const buildHandler = (eventExists: boolean) => {
    const repo = {
      findEventForEngagement: jest.fn().mockResolvedValue(
        eventExists
          ? {
              id: 'e',
              organizerKeycloakSub: 'organizer-sub',
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
    const blocks = { isBlockedBetween: jest.fn().mockResolvedValue(false) };

    return {
      handler: new SetEventLikeHandler(
        repo as unknown as EventEngagementRepository,
        blocks as unknown as UserBlockRepository
      ),
      repo,
      blocks
    };
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
      organizerKeycloakSub: 'organizer-sub',
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

  it('masks blocked organizers but still allows removing an existing like', async () => {
    const { handler, repo, blocks } = buildHandler(true);
    blocks.isBlockedBetween.mockResolvedValue(true);

    await expect(handler.execute(new SetEventLikeCommand(randomUUID(), 'sub-1', true))).rejects.toThrow(
      'EVENT_NOT_FOUND'
    );
    await expect(handler.execute(new SetEventLikeCommand(randomUUID(), 'sub-1', false))).resolves.toMatchObject({
      liked: false
    });
    expect(repo.setLike).toHaveBeenCalledTimes(1);
  });
});
