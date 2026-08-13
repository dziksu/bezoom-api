import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  EventEngagementRepository,
  isEventAvailableForEngagement
} from '../../../domain/engagement/event-engagement.repository';
import { SetEventSaveCommand } from './set-event-save.command';
import type { SaveResponseDto } from '../../dto/engagement.dto';
import { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';

@CommandHandler(SetEventSaveCommand)
export class SetEventSaveHandler implements ICommandHandler<SetEventSaveCommand, SaveResponseDto> {
  constructor(
    private readonly engagementRepository: EventEngagementRepository,
    private readonly blocks: UserBlockRepository
  ) {}

  async execute(command: SetEventSaveCommand): Promise<SaveResponseDto> {
    const event = await this.engagementRepository.findEventForEngagement(command.eventId);
    if (!event || !isEventAvailableForEngagement(event)) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }
    if (command.saved && (await this.blocks.isBlockedBetween(command.keycloakSub, event.organizerKeycloakSub))) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }

    await this.engagementRepository.setSave(command.eventId, command.keycloakSub, command.saved);

    return { saved: command.saved };
  }
}
