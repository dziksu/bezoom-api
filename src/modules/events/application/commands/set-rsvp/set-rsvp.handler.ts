import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  EventEngagementRepository,
  isEventAvailableForEngagement
} from '../../../domain/engagement/event-engagement.repository';
import { SetRsvpCommand } from './set-rsvp.command';
import type { RsvpResponseDto } from '../../dto/engagement.dto';
import { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';

@CommandHandler(SetRsvpCommand)
export class SetRsvpHandler implements ICommandHandler<SetRsvpCommand, RsvpResponseDto> {
  constructor(
    private readonly engagementRepository: EventEngagementRepository,
    private readonly blocks: UserBlockRepository
  ) {}

  async execute(command: SetRsvpCommand): Promise<RsvpResponseDto> {
    const event = await this.engagementRepository.findEventForEngagement(command.eventId);
    if (!event || !isEventAvailableForEngagement(event)) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }
    if (command.status && (await this.blocks.isBlockedBetween(command.keycloakSub, event.organizerKeycloakSub))) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }

    if (command.status === null) {
      await this.engagementRepository.cancelRsvp(command.eventId, command.keycloakSub);
    } else {
      await this.engagementRepository.setRsvp(command.eventId, command.keycloakSub, command.status);
    }

    const { attendingCount } = await this.engagementRepository.getStats(command.eventId);

    return { status: command.status, attendingCount };
  }
}
