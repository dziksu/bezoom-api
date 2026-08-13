import type { DomainEvent } from '@api/shared/domain/entities/aggregate-root';

export class EventCreatedDomainEvent implements DomainEvent {
  readonly eventType = 'event.created';
  readonly occurredOn: Date;

  constructor(
    public readonly eventId: string,
    public readonly organizerKeycloakSub: string
  ) {
    this.occurredOn = new Date();
  }
}
