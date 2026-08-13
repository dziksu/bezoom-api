import { GeoCoordinates } from './geo-coordinates.vo';

export interface EventLocationInput {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
}

export class EventLocation {
  private constructor(
    public readonly coordinates: GeoCoordinates,
    public readonly address?: string,
    public readonly city?: string,
    public readonly country: string = 'PL'
  ) {}

  static create(input: EventLocationInput): EventLocation {
    const coordinates = GeoCoordinates.create(input.latitude, input.longitude);
    return new EventLocation(coordinates, input.address, input.city, input.country ?? 'PL');
  }
}
