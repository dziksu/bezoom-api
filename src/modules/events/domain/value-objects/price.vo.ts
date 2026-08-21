import { DomainValidationError } from '../events.errors';

export const PRICE_TYPES = ['FREE', 'FIXED', 'RANGE', 'DONATION'] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export interface PriceInput {
  priceType: PriceType;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  ticketUrl?: string;
  priceNotes?: string;
}

export class Price {
  private constructor(
    public readonly priceType: PriceType,
    public readonly priceMin: number | undefined,
    public readonly priceMax: number | undefined,
    public readonly currency: string,
    public readonly ticketUrl?: string,
    public readonly priceNotes?: string
  ) {}

  static create(input: PriceInput): Price {
    const currency = input.currency ?? 'PLN';

    switch (input.priceType) {
      case 'FREE':
      case 'DONATION':
        if (input.priceMin !== undefined || input.priceMax !== undefined) {
          throw new DomainValidationError('EVENT_PRICE_NOT_ALLOWED');
        }
        return new Price(input.priceType, undefined, undefined, currency, input.ticketUrl, input.priceNotes);

      case 'FIXED':
        if (input.priceMin === undefined || input.priceMin <= 0) {
          throw new DomainValidationError('EVENT_FIXED_PRICE_INVALID');
        }
        if (input.priceMax !== undefined) {
          throw new DomainValidationError('EVENT_FIXED_PRICE_MAX_NOT_ALLOWED');
        }
        return new Price(input.priceType, input.priceMin, undefined, currency, input.ticketUrl, input.priceNotes);

      case 'RANGE':
        if (input.priceMin === undefined || input.priceMax === undefined) {
          throw new DomainValidationError('EVENT_PRICE_RANGE_REQUIRED');
        }
        if (input.priceMin < 0 || input.priceMin >= input.priceMax) {
          throw new DomainValidationError('EVENT_PRICE_RANGE_INVALID');
        }
        return new Price(input.priceType, input.priceMin, input.priceMax, currency, input.ticketUrl, input.priceNotes);

      default:
        throw new DomainValidationError('EVENT_PRICE_TYPE_INVALID');
    }
  }
}
