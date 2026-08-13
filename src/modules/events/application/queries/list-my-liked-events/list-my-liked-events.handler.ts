import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import { ListMyLikedEventsQuery } from './list-my-liked-events.query';
import type { PaginatedEventsDto } from '../../dto/event-response.dto';

@QueryHandler(ListMyLikedEventsQuery)
export class ListMyLikedEventsHandler implements IQueryHandler<ListMyLikedEventsQuery, PaginatedEventsDto> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: ListMyLikedEventsQuery): Promise<PaginatedEventsDto> {
    const { items, total } = await this.readService.listLiked(query.keycloakSub, query.page, query.limit);
    return { items, page: query.page, limit: query.limit, total };
  }
}
