import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import { ListMySavedEventsQuery } from './list-my-saved-events.query';
import type { CursorEventsDto } from '../../dto/event-response.dto';

@QueryHandler(ListMySavedEventsQuery)
export class ListMySavedEventsHandler implements IQueryHandler<ListMySavedEventsQuery, CursorEventsDto> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: ListMySavedEventsQuery): Promise<CursorEventsDto> {
    return this.readService.listSaved(query.keycloakSub, query.cursor, query.limit);
  }
}
