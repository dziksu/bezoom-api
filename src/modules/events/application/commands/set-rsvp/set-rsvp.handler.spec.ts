import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { SetRsvpHandler } from './set-rsvp.handler';
import { SetRsvpCommand } from './set-rsvp.command';
import type { EventEngagementRepository } from '../../../domain/engagement/event-engagement.repository';

describe('SetRsvpHandler', () => {
  const buildHandler = (
    snapshot: {
      id: string;
      status: string;
      visibility: string;
      verificationStatus: string;
      mediaPipelineStatus: string | null;
    } | null
  ) => {
    const repo = {
      findEventForEngagement: jest.fn().mockResolvedValue(snapshot),
      setRsvp: jest.fn().mockResolvedValue(undefined),
      cancelRsvp: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockResolvedValue({ likesCount: 0, savesCount: 0, attendingCount: 3, commentsCount: 0 })
    };

    return { handler: new SetRsvpHandler(repo as unknown as EventEngagementRepository), repo };
  };

  const published = {
    id: 'e',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    verificationStatus: 'VERIFIED',
    mediaPipelineStatus: 'READY'
  };

  it('sets an RSVP status on a published event', async () => {
    const { handler, repo } = buildHandler(published);
    const id = randomUUID();

    const result = await handler.execute(new SetRsvpCommand(id, 'sub-1', 'CONFIRMED'));

    expect(repo.setRsvp).toHaveBeenCalledWith(id, 'sub-1', 'CONFIRMED');
    expect(result).toEqual({ status: 'CONFIRMED', attendingCount: 3 });
  });

  it('cancels an RSVP when status is null', async () => {
    const { handler, repo } = buildHandler(published);
    const id = randomUUID();

    const result = await handler.execute(new SetRsvpCommand(id, 'sub-1', null));

    expect(repo.cancelRsvp).toHaveBeenCalledWith(id, 'sub-1');
    expect(repo.setRsvp).not.toHaveBeenCalled();
    expect(result.status).toBeNull();
  });

  it('conceals a cancelled event', async () => {
    const { handler, repo } = buildHandler({ ...published, status: 'CANCELLED' });

    await expect(handler.execute(new SetRsvpCommand(randomUUID(), 'sub-1', 'CONFIRMED'))).rejects.toThrow(
      NotFoundException
    );
    expect(repo.setRsvp).not.toHaveBeenCalled();
  });

  it('conceals a private event', async () => {
    const { handler, repo } = buildHandler({ ...published, visibility: 'PRIVATE' });

    await expect(handler.execute(new SetRsvpCommand(randomUUID(), 'sub-1', null))).rejects.toThrow('EVENT_NOT_FOUND');
    expect(repo.cancelRsvp).not.toHaveBeenCalled();
  });

  it('throws NotFound when the event does not exist', async () => {
    const { handler } = buildHandler(null);

    await expect(handler.execute(new SetRsvpCommand(randomUUID(), 'sub-1', 'MAYBE'))).rejects.toThrow(
      NotFoundException
    );
  });
});
