import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventGeocodingService } from './event-geocoding.service';

describe('EventGeocodingService', () => {
  const config = {
    get: jest.fn().mockReturnValue('http://nominatim:8080')
  } as unknown as ConfigService;
  const service = new EventGeocodingService(config);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('searches only inside Poland and maps the selected address to coordinates', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        {
          place_id: 123,
          display_name: 'Rynek Główny 1, Kraków, Polska',
          lat: '50.06143',
          lon: '19.93658',
          address: {
            road: 'Rynek Główny',
            house_number: '1',
            city: 'Kraków',
            country_code: 'pl'
          }
        }
      ]
    } as Response);

    await expect(service.search('Rynek Główny 1')).resolves.toEqual([
      {
        id: '123',
        label: 'Rynek Główny 1, Kraków, Polska',
        latitude: 50.06143,
        longitude: 19.93658,
        address: 'Rynek Główny 1',
        city: 'Kraków',
        country: 'PL'
      }
    ]);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('countrycodes')).toBe('pl');
    expect(url.searchParams.get('bounded')).toBe('1');
    expect(url.searchParams.get('viewbox')).toBe('14.122,54.836,24.145,49.002');
    expect(url.searchParams.get('accept-language')).toBe('pl');
    expect(url.searchParams.get('limit')).toBe('6');
  });

  it('drops malformed and non-Polish search results', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        {
          place_id: 1,
          display_name: 'Berlin',
          lat: '52.52',
          lon: '13.405',
          address: { country_code: 'de' }
        },
        {
          place_id: 2,
          display_name: 'Invalid',
          lat: 'not-a-number',
          lon: '19.9',
          address: { country_code: 'pl' }
        }
      ]
    } as Response);

    await expect(service.search('Berlin')).resolves.toEqual([]);
  });

  it('rejects reverse-geocoded coordinates outside Poland', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        place_id: 1,
        display_name: 'Berlin',
        lat: '52.52',
        lon: '13.405',
        address: { country_code: 'de' }
      })
    } as Response);

    await expect(service.reverse(52.52, 13.405)).rejects.toThrow(
      new BadRequestException('EVENT_LOCATION_OUTSIDE_POLAND')
    );
  });

  it('returns a stable service-unavailable error when Nominatim is not ready', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connection refused'));

    await expect(service.search('Warszawa')).rejects.toThrow(
      new ServiceUnavailableException('GEOCODING_SERVICE_UNAVAILABLE')
    );
  });
});
