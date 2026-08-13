import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import { ListMyAttendingEventsQuery } from './list-my-attending-events.query';
import type { CursorAttendingEventsDto } from '../../dto/event-response.dto';

@QueryHandler(ListMyAttendingEventsQuery)
export class ListMyAttendingEventsHandler implements IQueryHandler<
  ListMyAttendingEventsQuery,
  CursorAttendingEventsDto
> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: ListMyAttendingEventsQuery): Promise<CursorAttendingEventsDto> {
    return this.readService.listAttending(query.keycloakSub, query.cursor, query.limit);
  }
}
