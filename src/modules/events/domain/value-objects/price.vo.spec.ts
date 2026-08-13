import { Price } from './price.vo';
import { DomainValidationError } from '../events.errors';

describe('Price', () => {
  it('creates FREE price with no amounts', () => {
    const price = Price.create({ priceType: 'FREE' });
    expect(price.priceMin).toBeUndefined();
    expect(price.currency).toBe('PLN');
  });

  it('rejects FREE price with an amount set', () => {
    expect(() => Price.create({ priceType: 'FREE', priceMin: 10 })).toThrow(DomainValidationError);
  });

  it('requires priceMin > 0 for FIXED', () => {
    expect(() => Price.create({ priceType: 'FIXED', priceMin: 0 })).toThrow(DomainValidationError);
  });

  it('rejects FIXED price with priceMax set', () => {
    expect(() => Price.create({ priceType: 'FIXED', priceMin: 20, priceMax: 30 })).toThrow(DomainValidationError);
  });

  it('accepts a valid FIXED price', () => {
    const price = Price.create({ priceType: 'FIXED', priceMin: 20 });
    expect(price.priceMin).toBe(20);
  });

  it('requires priceMin < priceMax for RANGE', () => {
    expect(() => Price.create({ priceType: 'RANGE', priceMin: 30, priceMax: 30 })).toThrow(DomainValidationError);
  });

  it('accepts a valid RANGE price', () => {
    const price = Price.create({ priceType: 'RANGE', priceMin: 10, priceMax: 50 });
    expect(price.priceMin).toBe(10);
    expect(price.priceMax).toBe(50);
  });

  it('creates DONATION price with no amounts', () => {
    const price = Price.create({ priceType: 'DONATION' });
    expect(price.priceMin).toBeUndefined();
  });
});
