import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { StorageModule } from '@api/shared/infrastructure/storage/storage.module';
import { EventsController } from './presentation/events.controller';
import { EventCommentsController } from './presentation/event-comments.controller';
import { EventRepository } from './domain/event.repository';
import { EventEngagementRepository } from './domain/engagement/event-engagement.repository';
import { EventCommentRepository } from './domain/comments/event-comment.repository';
import { DrizzleEventRepository } from './infrastructure/persistence/drizzle-event.repository';
import { DrizzleEventEngagementRepository } from './infrastructure/persistence/drizzle-event-engagement.repository';
import { DrizzleEventCommentRepository } from './infrastructure/persistence/drizzle-event-comment.repository';
import { EventReadService } from './infrastructure/read/event-read.service';
import { EventSocialReadService } from './infrastructure/read/event-social-read.service';
import { CreateEventHandler } from './application/commands/create-event/create-event.handler';
import { RequestPhotoUploadsHandler } from './application/commands/request-photo-uploads/request-photo-uploads.handler';
import { SetEventLikeHandler } from './application/commands/set-event-like/set-event-like.handler';
import { SetEventSaveHandler } from './application/commands/set-event-save/set-event-save.handler';
import { SetRsvpHandler } from './application/commands/set-rsvp/set-rsvp.handler';
import { PublishEventHandler } from './application/commands/publish-event/publish-event.handler';
import { UpdateEventHandler } from './application/commands/update-event/update-event.handler';
import { ResubmitEventHandler } from './application/commands/resubmit-event/resubmit-event.handler';
import { CancelEventHandler } from './application/commands/cancel-event/cancel-event.handler';
import { ArchiveEventHandler } from './application/commands/archive-event/archive-event.handler';
import { CreateEventCommentHandler } from './application/commands/create-event-comment/create-event-comment.handler';
import { UpdateEventCommentHandler } from './application/commands/update-event-comment/update-event-comment.handler';
import { DeleteEventCommentHandler } from './application/commands/delete-event-comment/delete-event-comment.handler';
import { SearchEventsByLocationHandler } from './application/queries/search-events-by-location/search-events-by-location.handler';
import { GetMapEventsHandler } from './application/queries/get-map-events/get-map-events.handler';
import { GetEventByIdHandler } from './application/queries/get-event-by-id/get-event-by-id.handler';
import { ListMyCreatedEventsHandler } from './application/queries/list-my-created-events/list-my-created-events.handler';
import { ListMyAttendingEventsHandler } from './application/queries/list-my-attending-events/list-my-attending-events.handler';
import { ListMyLikedEventsHandler } from './application/queries/list-my-liked-events/list-my-liked-events.handler';
import { ListMySavedEventsHandler } from './application/queries/list-my-saved-events/list-my-saved-events.handler';
import {
  ListEventCommentsHandler,
  ListEventLikesHandler,
  ListEventParticipantsHandler
} from './application/queries/list-event-social/list-event-social.handlers';
import { EventStatsProjectionService } from './infrastructure/projections/event-stats-projection.service';
import { EventPublicationPolicy } from './application/policies/event-publication.policy';
import { DrizzleEventPublicationPolicy } from './infrastructure/policies/drizzle-event-publication.policy';
import { EventPipelineService } from './infrastructure/pipeline/event-pipeline.service';
import { EventPipelineProcessor } from './infrastructure/pipeline/event-pipeline.processor';
import { EventPipelineOutboxDispatcher } from './infrastructure/pipeline/event-pipeline-outbox-dispatcher.service';
import { SafetyModule } from '../safety/safety.module';

const commandHandlers = [
  CreateEventHandler,
  RequestPhotoUploadsHandler,
  SetEventLikeHandler,
  SetEventSaveHandler,
  SetRsvpHandler,
  PublishEventHandler,
  UpdateEventHandler,
  ResubmitEventHandler,
  CancelEventHandler,
  ArchiveEventHandler,
  CreateEventCommentHandler,
  UpdateEventCommentHandler,
  DeleteEventCommentHandler
];
const queryHandlers = [
  SearchEventsByLocationHandler,
  GetMapEventsHandler,
  GetEventByIdHandler,
  ListMyCreatedEventsHandler,
  ListMyAttendingEventsHandler,
  ListMyLikedEventsHandler,
  ListMySavedEventsHandler,
  ListEventCommentsHandler,
  ListEventLikesHandler,
  ListEventParticipantsHandler
];
@Module({
  imports: [CqrsModule, StorageModule, SafetyModule],
  controllers: [EventsController, EventCommentsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    EventReadService,
    EventSocialReadService,
    EventStatsProjectionService,
    EventPipelineService,
    EventPipelineProcessor,
    EventPipelineOutboxDispatcher,
    { provide: EventRepository, useClass: DrizzleEventRepository },
    { provide: EventEngagementRepository, useClass: DrizzleEventEngagementRepository },
    { provide: EventCommentRepository, useClass: DrizzleEventCommentRepository },
    { provide: EventPublicationPolicy, useClass: DrizzleEventPublicationPolicy }
  ],
  exports: [EventReadService]
})
export class EventsModule {}
