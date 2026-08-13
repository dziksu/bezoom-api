import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import { ListMyCreatedEventsQuery } from './list-my-created-events.query';
import type { CursorEventsDto } from '../../dto/event-response.dto';

@QueryHandler(ListMyCreatedEventsQuery)
export class ListMyCreatedEventsHandler implements IQueryHandler<ListMyCreatedEventsQuery, CursorEventsDto> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: ListMyCreatedEventsQuery): Promise<CursorEventsDto> {
    return this.readService.listByOrganizer(query.organizerKeycloakSub, query.cursor, query.limit);
  }
}
