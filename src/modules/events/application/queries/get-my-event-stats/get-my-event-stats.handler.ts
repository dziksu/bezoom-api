import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import type { MyEventStatsDto } from '../../dto/event-response.dto';
import { GetMyEventStatsQuery } from './get-my-event-stats.query';

@QueryHandler(GetMyEventStatsQuery)
export class GetMyEventStatsHandler implements IQueryHandler<GetMyEventStatsQuery, MyEventStatsDto> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: GetMyEventStatsQuery): Promise<MyEventStatsDto> {
    return this.readService.getMyStats(query.keycloakSub);
  }
}
