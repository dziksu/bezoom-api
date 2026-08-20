import { ConflictException, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { EventRepository } from '../../../domain/event.repository';
import { DomainValidationError } from '../../../domain/events.errors';
import { isEventMapVisible } from '../../cache/event-cache-visibility';
import type { EventLifecycleResponseDto } from '../../dto/event-response.dto';
import { CancelEventCommand } from './cancel-event.command';

@CommandHandler(CancelEventCommand)
export class CancelEventHandler implements ICommandHandler<CancelEventCommand, EventLifecycleResponseDto> {
  constructor(
    private readonly repository: EventRepository,
    private readonly cache: RedisCacheService
  ) {}

  async execute(command: CancelEventCommand): Promise<EventLifecycleResponseDto> {
    const event = await this.repository.findById(command.eventId);
    if (!event || event.archivedAt || event.organizerKeycloakSub !== command.organizerKeycloakSub) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }
    const wasMapVisible = isEventMapVisible(event);
    try {
      event.cancel();
    } catch (error) {
      if (error instanceof DomainValidationError) throw new ConflictException(error.code);
      throw error;
    }
    await this.repository.update(event);
    await this.cache.delete('event_detail', event.id);
    if (wasMapVisible) await this.cache.incrementVersion('event_map');
    return {
      id: event.id,
      status: event.status,
      mediaPipelineStatus: event.mediaPipelineStatus,
      verificationStatus: event.verificationStatus,
      updatedAt: event.updatedAt
    };
  }
}
