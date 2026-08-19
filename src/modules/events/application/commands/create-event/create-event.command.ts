import type { EventCategory } from '../../../domain/event.aggregate';
import type { PriceType } from '../../../domain/value-objects/price.vo';

export class CreateEventCommand {
  constructor(
    public readonly organizerKeycloakSub: string,
    public readonly title: string,
    public readonly description: string,
    public readonly category: EventCategory,
    public readonly startDate: string,
    public readonly location: {
      latitude: number;
      longitude: number;
      address?: string;
      city?: string;
      country?: string;
    },
    public readonly priceType: PriceType,
    public readonly photoIds: string[],
    public readonly submittedByIsOrganizer = false,
    public readonly endDate?: string,
    public readonly priceMin?: number,
    public readonly priceMax?: number,
    public readonly currency?: string,
    public readonly ticketUrl?: string,
    public readonly priceNotes?: string,
    public readonly amenities?: string[]
  ) {}
}
