import { DomainValidationError } from '../events.errors';

export class GeoCoordinates {
  private constructor(
    public readonly latitude: number,
    public readonly longitude: number
  ) {}

  static create(latitude: number, longitude: number): GeoCoordinates {
    if (latitude < -90 || latitude > 90) {
      throw new DomainValidationError('EVENT_LATITUDE_INVALID');
    }
    if (longitude < -180 || longitude > 180) {
      throw new DomainValidationError('EVENT_LONGITUDE_INVALID');
    }
    return new GeoCoordinates(latitude, longitude);
  }
}
