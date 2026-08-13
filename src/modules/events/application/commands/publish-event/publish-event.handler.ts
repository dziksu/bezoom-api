import { ConflictException, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { EventRepository } from '../../../domain/event.repository';
import { DomainValidationError } from '../../../domain/events.errors';
import { EventPublicationPolicy } from '../../policies/event-publication.policy';
import type { EventLifecycleResponseDto } from '../../dto/event-response.dto';
import { PublishEventCommand } from './publish-event.command';

@CommandHandler(PublishEventCommand)
export class PublishEventHandler implements ICommandHandler<PublishEventCommand, EventLifecycleResponseDto> {
  constructor(
    private readonly repository: EventRepository,
    private readonly publicationPolicy: EventPublicationPolicy,
    private readonly cache: RedisCacheService
  ) {}

  async execute(command: PublishEventCommand): Promise<EventLifecycleResponseDto> {
    const event = await this.repository.findById(command.eventId);
    if (!event || event.organizerKeycloakSub !== command.organizerKeycloakSub) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }

    const eligibilityError = await this.publicationPolicy.getEligibilityError(command.organizerKeycloakSub);
    if (eligibilityError) throw new ConflictException(eligibilityError);

    try {
      event.publish();
    } catch (error) {
      if (error instanceof DomainValidationError) {
        throw new ConflictException(error.code);
      }
      throw error;
    }

    await this.repository.updateLifecycle(event);
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
