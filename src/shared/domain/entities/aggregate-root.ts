import { BaseEntity } from './base.entity';

export abstract class AggregateRoot<T> extends BaseEntity<T> {
  private _domainEvents: DomainEvent[] = [];

  get domainEvents(): ReadonlyArray<DomainEvent> {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  public clearEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}

export interface DomainEvent {
  eventType: string;
  occurredOn: Date;
}
