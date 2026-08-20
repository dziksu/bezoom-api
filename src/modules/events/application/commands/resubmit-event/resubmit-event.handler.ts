import { ConflictException, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { EventRepository } from '../../../domain/event.repository';
import { DomainValidationError } from '../../../domain/events.errors';
import type { EventLifecycleResponseDto } from '../../dto/event-response.dto';
import { ResubmitEventCommand } from './resubmit-event.command';

@CommandHandler(ResubmitEventCommand)
export class ResubmitEventHandler implements ICommandHandler<ResubmitEventCommand, EventLifecycleResponseDto> {
  constructor(
    private readonly repository: EventRepository,
    private readonly cache: RedisCacheService
  ) {}

  async execute(command: ResubmitEventCommand): Promise<EventLifecycleResponseDto> {
    const event = await this.repository.findById(command.eventId);
    if (!event || event.archivedAt || event.organizerKeycloakSub !== command.organizerKeycloakSub) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }
    try {
      event.resubmit();
    } catch (error) {
      if (error instanceof DomainValidationError) throw new ConflictException(error.code);
      throw error;
    }

    await this.repository.update(event, { enqueueReview: true });
    await this.cache.delete('event_detail', event.id);
    return {
      id: event.id,
      status: event.status,
      mediaPipelineStatus: event.mediaPipelineStatus,
      verificationStatus: event.verificationStatus,
      updatedAt: event.updatedAt
    };
  }
}
