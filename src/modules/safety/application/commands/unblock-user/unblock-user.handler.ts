import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { UserBlockRepository } from '../../../domain/user-block.repository';
import { UnblockUserCommand } from './unblock-user.command';

@CommandHandler(UnblockUserCommand)
export class UnblockUserHandler implements ICommandHandler<UnblockUserCommand, void> {
  constructor(private readonly blocks: UserBlockRepository) {}

  async execute(command: UnblockUserCommand): Promise<void> {
    await this.blocks.unblock(command.blockerKeycloakSub, command.blockedProfileId);
  }
}
