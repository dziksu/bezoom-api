import { DomainValidationError } from '../events.errors';

export class EventPeriod {
  private constructor(
    public readonly startDate: Date,
    public readonly endDate?: Date
  ) {}

  static create(startDate: Date, endDate?: Date): EventPeriod {
    if (Number.isNaN(startDate.getTime())) {
      throw new DomainValidationError('EVENT_START_DATE_INVALID');
    }
    if (startDate.getTime() <= Date.now()) {
      throw new DomainValidationError('EVENT_START_DATE_NOT_FUTURE');
    }
    if (endDate) {
      if (Number.isNaN(endDate.getTime())) {
        throw new DomainValidationError('EVENT_END_DATE_INVALID');
      }
      if (endDate.getTime() <= startDate.getTime()) {
        throw new DomainValidationError('EVENT_END_DATE_NOT_AFTER_START');
      }
    }
    return new EventPeriod(startDate, endDate);
  }

  /** Persistence-only constructor; historical events may legitimately be in the past. */
  static reconstitute(startDate: Date, endDate?: Date): EventPeriod {
    return new EventPeriod(startDate, endDate);
  }
}
