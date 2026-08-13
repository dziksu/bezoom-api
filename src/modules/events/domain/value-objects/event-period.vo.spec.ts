import { EventPeriod } from './event-period.vo';
import { DomainValidationError } from '../events.errors';

describe('EventPeriod', () => {
  const future = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);

  it('rejects a startDate in the past', () => {
    expect(() => EventPeriod.create(future(-1))).toThrow(DomainValidationError);
  });

  it('accepts a future startDate with no endDate', () => {
    const period = EventPeriod.create(future(1));
    expect(period.endDate).toBeUndefined();
  });

  it('rejects an endDate before startDate', () => {
    expect(() => EventPeriod.create(future(2), future(1))).toThrow(DomainValidationError);
  });

  it('rejects an endDate equal to startDate', () => {
    const start = future(1);
    expect(() => EventPeriod.create(start, start)).toThrow(DomainValidationError);
  });

  it('accepts a valid start/end range', () => {
    const period = EventPeriod.create(future(1), future(2));
    expect(period.endDate).toBeDefined();
  });
});
