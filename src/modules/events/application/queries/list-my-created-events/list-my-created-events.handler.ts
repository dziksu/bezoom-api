import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import { ListMyCreatedEventsQuery } from './list-my-created-events.query';
import type { PaginatedEventsDto } from '../../dto/event-response.dto';

@QueryHandler(ListMyCreatedEventsQuery)
export class ListMyCreatedEventsHandler implements IQueryHandler<ListMyCreatedEventsQuery, PaginatedEventsDto> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: ListMyCreatedEventsQuery): Promise<PaginatedEventsDto> {
    const { items, total } = await this.readService.listByOrganizer(
      query.organizerKeycloakSub,
      query.page,
      query.limit
    );
    return { items, page: query.page, limit: query.limit, total };
  }
}
