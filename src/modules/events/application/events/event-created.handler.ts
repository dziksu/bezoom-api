import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { EventCreatedDomainEvent } from '../../domain/events/event-created.domain-event';

// Thin for now — logs only. Future: enqueue BullMQ jobs (notifications to followers,
// moderation pipeline kick-off) once BullMQ is wired into AppModule.
@EventsHandler(EventCreatedDomainEvent)
export class EventCreatedHandler implements IEventHandler<EventCreatedDomainEvent> {
  private readonly logger = new Logger(EventCreatedHandler.name);

  handle(event: EventCreatedDomainEvent): void {
    this.logger.log(`EventCreated: ${event.eventId} (organizer ${event.organizerKeycloakSub})`);
  }
}
