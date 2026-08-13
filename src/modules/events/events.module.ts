import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { StorageModule } from '@api/shared/infrastructure/storage/storage.module';
import { EventsController } from './presentation/events.controller';
import { EventRepository } from './domain/event.repository';
import { EventEngagementRepository } from './domain/engagement/event-engagement.repository';
import { DrizzleEventRepository } from './infrastructure/persistence/drizzle-event.repository';
import { DrizzleEventEngagementRepository } from './infrastructure/persistence/drizzle-event-engagement.repository';
import { EventReadService } from './infrastructure/read/event-read.service';
import { CreateEventHandler } from './application/commands/create-event/create-event.handler';
import { RequestPhotoUploadsHandler } from './application/commands/request-photo-uploads/request-photo-uploads.handler';
import { SetEventLikeHandler } from './application/commands/set-event-like/set-event-like.handler';
import { SetEventSaveHandler } from './application/commands/set-event-save/set-event-save.handler';
import { SetRsvpHandler } from './application/commands/set-rsvp/set-rsvp.handler';
import { PublishEventHandler } from './application/commands/publish-event/publish-event.handler';
import { SearchEventsByLocationHandler } from './application/queries/search-events-by-location/search-events-by-location.handler';
import { GetEventByIdHandler } from './application/queries/get-event-by-id/get-event-by-id.handler';
import { ListMyCreatedEventsHandler } from './application/queries/list-my-created-events/list-my-created-events.handler';
import { ListMyAttendingEventsHandler } from './application/queries/list-my-attending-events/list-my-attending-events.handler';
import { ListMyLikedEventsHandler } from './application/queries/list-my-liked-events/list-my-liked-events.handler';
import { ListMySavedEventsHandler } from './application/queries/list-my-saved-events/list-my-saved-events.handler';
import { EventStatsProjectionService } from './infrastructure/projections/event-stats-projection.service';
import { EventPublicationPolicy } from './application/policies/event-publication.policy';
import { DrizzleEventPublicationPolicy } from './infrastructure/policies/drizzle-event-publication.policy';
import { EventPipelineService } from './infrastructure/pipeline/event-pipeline.service';
import { EventPipelineProcessor } from './infrastructure/pipeline/event-pipeline.processor';
import { EventPipelineOutboxDispatcher } from './infrastructure/pipeline/event-pipeline-outbox-dispatcher.service';

const commandHandlers = [
  CreateEventHandler,
  RequestPhotoUploadsHandler,
  SetEventLikeHandler,
  SetEventSaveHandler,
  SetRsvpHandler,
  PublishEventHandler
];
const queryHandlers = [
  SearchEventsByLocationHandler,
  GetEventByIdHandler,
  ListMyCreatedEventsHandler,
  ListMyAttendingEventsHandler,
  ListMyLikedEventsHandler,
  ListMySavedEventsHandler
];
@Module({
  imports: [CqrsModule, StorageModule],
  controllers: [EventsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    EventReadService,
    EventStatsProjectionService,
    EventPipelineService,
    EventPipelineProcessor,
    EventPipelineOutboxDispatcher,
    { provide: EventRepository, useClass: DrizzleEventRepository },
    { provide: EventEngagementRepository, useClass: DrizzleEventEngagementRepository },
    { provide: EventPublicationPolicy, useClass: DrizzleEventPublicationPolicy }
  ]
})
export class EventsModule {}
