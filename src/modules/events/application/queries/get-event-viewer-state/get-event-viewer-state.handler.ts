import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EventReadService } from '../../../infrastructure/read/event-read.service';
import type { EventViewerStateDto } from '../../dto/event-response.dto';
import { GetEventViewerStateQuery } from './get-event-viewer-state.query';

@QueryHandler(GetEventViewerStateQuery)
export class GetEventViewerStateHandler implements IQueryHandler<GetEventViewerStateQuery, EventViewerStateDto> {
  constructor(private readonly readService: EventReadService) {}

  async execute(query: GetEventViewerStateQuery): Promise<EventViewerStateDto> {
    const state = await this.readService.getViewerState(query.eventId, query.keycloakSub);
    if (!state) throw new NotFoundException('EVENT_NOT_FOUND');
    return state;
  }
}
