import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { EventSocialReadService } from '../../../infrastructure/read/event-social-read.service';
import type {
  CommentMentionSuggestionsDto,
  CursorEventActorsDto,
  CursorEventCommentsDto
} from '../../dto/event-social.dto';
import {
  ListCommentMentionSuggestionsQuery,
  ListEventCommentsQuery,
  ListEventLikesQuery,
  ListEventParticipantsQuery
} from './list-event-social.queries';

@QueryHandler(ListEventCommentsQuery)
export class ListEventCommentsHandler implements IQueryHandler<ListEventCommentsQuery, CursorEventCommentsDto> {
  constructor(private readonly readService: EventSocialReadService) {}

  execute(query: ListEventCommentsQuery): Promise<CursorEventCommentsDto> {
    return this.readService.listComments(query.eventId, query.cursor, query.limit, query.viewerKeycloakSub);
  }
}

@QueryHandler(ListCommentMentionSuggestionsQuery)
export class ListCommentMentionSuggestionsHandler implements IQueryHandler<
  ListCommentMentionSuggestionsQuery,
  CommentMentionSuggestionsDto
> {
  constructor(private readonly readService: EventSocialReadService) {}

  execute(query: ListCommentMentionSuggestionsQuery): Promise<CommentMentionSuggestionsDto> {
    return this.readService.listMentionSuggestions(query.eventId, query.query, query.limit, query.viewerKeycloakSub);
  }
}

@QueryHandler(ListEventLikesQuery)
export class ListEventLikesHandler implements IQueryHandler<ListEventLikesQuery, CursorEventActorsDto> {
  constructor(private readonly readService: EventSocialReadService) {}

  execute(query: ListEventLikesQuery): Promise<CursorEventActorsDto> {
    return this.readService.listLikes(query.eventId, query.cursor, query.limit, query.viewerKeycloakSub);
  }
}

@QueryHandler(ListEventParticipantsQuery)
export class ListEventParticipantsHandler implements IQueryHandler<ListEventParticipantsQuery, CursorEventActorsDto> {
  constructor(private readonly readService: EventSocialReadService) {}

  execute(query: ListEventParticipantsQuery): Promise<CursorEventActorsDto> {
    return this.readService.listParticipants(query.eventId, query.cursor, query.limit, query.viewerKeycloakSub);
  }
}
