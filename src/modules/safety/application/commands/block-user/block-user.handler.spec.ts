import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { UserBlockRepository } from '../../../domain/user-block.repository';
import { BlockUserCommand } from './block-user.command';
import { BlockUserHandler } from './block-user.handler';

describe('BlockUserHandler', () => {
  const target = {
    blockId: 'd45f5bb8-bf19-4a6f-bbab-61e338e12262',
    profileId: 'a0cf776e-5e07-497f-a32e-cd5eb1243312',
    keycloakSub: 'blocked-sub',
    username: 'blocked',
    firstName: null,
    lastName: null,
    avatarUrl: null,
    blockedAt: new Date('2026-08-13T12:00:00.000Z')
  };

  it('creates an idempotent block by public profile id', async () => {
    const repository = { block: jest.fn().mockResolvedValue(target) };
    const handler = new BlockUserHandler(repository as unknown as UserBlockRepository);

    await expect(handler.execute(new BlockUserCommand('blocker-sub', target.profileId))).resolves.toEqual({
      profileId: target.profileId,
      blocked: true
    });
  });

  it('returns stable keys for an unknown target and a self-block', async () => {
    const repository = {
      block: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...target, keycloakSub: 'self' })
    };
    const handler = new BlockUserHandler(repository as unknown as UserBlockRepository);

    await expect(handler.execute(new BlockUserCommand('self', target.profileId))).rejects.toEqual(
      new NotFoundException('PROFILE_NOT_FOUND')
    );
    await expect(handler.execute(new BlockUserCommand('self', target.profileId))).rejects.toEqual(
      new BadRequestException('USER_CANNOT_BLOCK_SELF')
    );
  });
});
