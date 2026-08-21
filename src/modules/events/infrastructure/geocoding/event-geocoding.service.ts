import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlaceSuggestionDto } from '../../application/dto/place-search.dto';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    house_number?: string;
    house_name?: string;
    amenity?: string;
    tourism?: string;
    shop?: string;
    office?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    city_district?: string;
    district?: string;
    borough?: string;
    suburb?: string;
    country_code?: string;
  };
}

const POLAND_VIEWBOX = '14.122,54.836,24.145,49.002';
const POLAND_BOUNDS = {
  west: 14.122,
  south: 49.002,
  east: 24.145,
  north: 54.836
} as const;

@Injectable()
export class EventGeocodingService {
  constructor(private readonly config: ConfigService) {}

  async search(query: string): Promise<PlaceSuggestionDto[]> {
    const url = new URL('/search', this.baseUrl());
    url.searchParams.set('q', query.trim());
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'pl');
    url.searchParams.set('viewbox', POLAND_VIEWBOX);
    url.searchParams.set('bounded', '1');
    url.searchParams.set('accept-language', 'pl');
    url.searchParams.set('dedupe', '1');
    url.searchParams.set('limit', '6');
    const results = await this.request<NominatimResult[]>(url);
    return results.flatMap((result) => {
      const place = this.map(result);
      return place && this.isInPoland(place.latitude, place.longitude, place.country) ? [place] : [];
    });
  }

  async reverse(latitude: number, longitude: number): Promise<PlaceSuggestionDto> {
    const url = new URL('/reverse', this.baseUrl());
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'pl');
    const place = this.map(await this.request<NominatimResult>(url));
    if (!place || !this.isInPoland(place.latitude, place.longitude, place.country)) {
      throw new BadRequestException('EVENT_LOCATION_OUTSIDE_POLAND');
    }
    return place;
  }

  private async request<T>(url: URL): Promise<T> {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'BeZoom/1.0 event-location-picker' },
        signal: AbortSignal.timeout(5_000)
      });
      if (!response.ok) throw new Error(`GEOCODING_HTTP_${response.status}`);
      return (await response.json()) as T;
    } catch {
      throw new ServiceUnavailableException('GEOCODING_SERVICE_UNAVAILABLE');
    }
  }

  private baseUrl(): string {
    return this.config.get<string>('GEOCODING_SERVICE_URL', 'http://nominatim:8080');
  }

  private map(result: NominatimResult): PlaceSuggestionDto | undefined {
    const address = result.address;
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;

    const streetName = address?.road ?? address?.pedestrian ?? address?.footway;
    const placeName = address?.house_name ?? address?.amenity ?? address?.tourism ?? address?.shop ?? address?.office;
    const street = [streetName, address?.house_number].filter(Boolean).join(' ');
    return {
      id: String(result.place_id),
      label: result.display_name,
      latitude,
      longitude,
      address: street || placeName || undefined,
      city:
        address?.city ??
        address?.town ??
        address?.village ??
        address?.hamlet ??
        address?.municipality ??
        address?.city_district ??
        address?.district ??
        address?.borough ??
        address?.suburb,
      country: address?.country_code?.toUpperCase() ?? ''
    };
  }

  private isInPoland(latitude: number, longitude: number, country: string): boolean {
    return (
      country === 'PL' &&
      latitude >= POLAND_BOUNDS.south &&
      latitude <= POLAND_BOUNDS.north &&
      longitude >= POLAND_BOUNDS.west &&
      longitude <= POLAND_BOUNDS.east
    );
  }
}
