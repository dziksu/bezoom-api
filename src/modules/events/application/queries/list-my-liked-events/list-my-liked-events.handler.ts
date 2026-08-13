import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import { ListMyLikedEventsQuery } from './list-my-liked-events.query';
import type { CursorEventsDto } from '../../dto/event-response.dto';

@QueryHandler(ListMyLikedEventsQuery)
export class ListMyLikedEventsHandler implements IQueryHandler<ListMyLikedEventsQuery, CursorEventsDto> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: ListMyLikedEventsQuery): Promise<CursorEventsDto> {
    return this.readService.listLiked(query.keycloakSub, query.cursor, query.limit);
  }
}
