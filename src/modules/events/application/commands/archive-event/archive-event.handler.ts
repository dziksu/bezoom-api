import { NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { EventRepository } from '../../../domain/event.repository';
import { isEventMapVisible } from '../../cache/event-cache-visibility';
import { ArchiveEventCommand } from './archive-event.command';

@CommandHandler(ArchiveEventCommand)
export class ArchiveEventHandler implements ICommandHandler<ArchiveEventCommand, void> {
  constructor(
    private readonly repository: EventRepository,
    private readonly cache: RedisCacheService
  ) {}

  async execute(command: ArchiveEventCommand): Promise<void> {
    const event = await this.repository.findById(command.eventId);
    if (!event || event.archivedAt || event.organizerKeycloakSub !== command.organizerKeycloakSub) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }
    const wasMapVisible = isEventMapVisible(event);
    event.archive();
    await this.repository.update(event);
    await this.cache.delete('event_detail', event.id);
    if (wasMapVisible) await this.cache.incrementVersion('event_map');
  }
}
