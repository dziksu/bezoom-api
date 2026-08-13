import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  EventEngagementRepository,
  isEventAvailableForEngagement
} from '../../../domain/engagement/event-engagement.repository';
import { SetEventLikeCommand } from './set-event-like.command';
import type { LikeResponseDto } from '../../dto/engagement.dto';
import { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';

@CommandHandler(SetEventLikeCommand)
export class SetEventLikeHandler implements ICommandHandler<SetEventLikeCommand, LikeResponseDto> {
  constructor(
    private readonly engagementRepository: EventEngagementRepository,
    private readonly blocks: UserBlockRepository
  ) {}

  async execute(command: SetEventLikeCommand): Promise<LikeResponseDto> {
    const event = await this.engagementRepository.findEventForEngagement(command.eventId);
    if (!event || !isEventAvailableForEngagement(event)) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }
    if (command.liked && (await this.blocks.isBlockedBetween(command.keycloakSub, event.organizerKeycloakSub))) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }

    await this.engagementRepository.setLike(command.eventId, command.keycloakSub, command.liked);
    const { likesCount } = await this.engagementRepository.getStats(command.eventId);

    return { liked: command.liked, likesCount };
  }
}
