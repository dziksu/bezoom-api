import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import { ListMyAttendingEventsQuery } from './list-my-attending-events.query';
import type { PaginatedAttendingEventsDto } from '../../dto/event-response.dto';

@QueryHandler(ListMyAttendingEventsQuery)
export class ListMyAttendingEventsHandler implements IQueryHandler<
  ListMyAttendingEventsQuery,
  PaginatedAttendingEventsDto
> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: ListMyAttendingEventsQuery): Promise<PaginatedAttendingEventsDto> {
    const { items, total } = await this.readService.listAttending(query.keycloakSub, query.page, query.limit);
    return { items, page: query.page, limit: query.limit, total };
  }
}
