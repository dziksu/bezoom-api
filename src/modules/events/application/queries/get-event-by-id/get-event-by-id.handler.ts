import { NotFoundException } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import { GetEventByIdQuery } from './get-event-by-id.query';
import type { EventDetailDto } from '../../dto/event-response.dto';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';

@QueryHandler(GetEventByIdQuery)
export class GetEventByIdHandler implements IQueryHandler<GetEventByIdQuery, EventDetailDto> {
  constructor(
    private readonly readService: EventReadService,
    private readonly cache: RedisCacheService,
    private readonly blocks: UserBlockRepository
  ) {}

  async execute(query: GetEventByIdQuery): Promise<EventDetailDto> {
    if (query.viewerKeycloakSub) {
      if (await this.blocks.isEventOrganizerBlocked(query.viewerKeycloakSub, query.eventId)) {
        throw new NotFoundException('EVENT_NOT_FOUND');
      }
      const event = await this.readService.findDetailById(query.eventId, query.viewerKeycloakSub);
      if (!event) throw new NotFoundException('EVENT_NOT_FOUND');
      return event;
    }
    return this.cache.getOrSet('event_detail', query.eventId, 30, async () => {
      const event = await this.readService.findDetailById(query.eventId);
      if (!event) throw new NotFoundException('EVENT_NOT_FOUND');
      return event;
    });
  }
}
