import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import { ListMySavedEventsQuery } from './list-my-saved-events.query';
import type { PaginatedEventsDto } from '../../dto/event-response.dto';

@QueryHandler(ListMySavedEventsQuery)
export class ListMySavedEventsHandler implements IQueryHandler<ListMySavedEventsQuery, PaginatedEventsDto> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: ListMySavedEventsQuery): Promise<PaginatedEventsDto> {
    const { items, total } = await this.readService.listSaved(query.keycloakSub, query.page, query.limit);
    return { items, page: query.page, limit: query.limit, total };
  }
}
