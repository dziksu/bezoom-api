import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { UserBlockRepository } from '../../../domain/user-block.repository';
import type { UserBlockResponseDto } from '../../dto/safety.dto';
import { BlockUserCommand } from './block-user.command';

@CommandHandler(BlockUserCommand)
export class BlockUserHandler implements ICommandHandler<BlockUserCommand, UserBlockResponseDto> {
  constructor(private readonly blocks: UserBlockRepository) {}

  async execute(command: BlockUserCommand): Promise<UserBlockResponseDto> {
    const block = await this.blocks.block(command.blockerKeycloakSub, command.blockedProfileId);
    if (!block) throw new NotFoundException('PROFILE_NOT_FOUND');
    if (block.keycloakSub === command.blockerKeycloakSub) {
      throw new BadRequestException('USER_CANNOT_BLOCK_SELF');
    }
    return { profileId: block.profileId, blocked: true };
  }
}
