import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MapEventsQueryDto } from './map-events.query.dto';

describe('MapEventsQueryDto', () => {
  it('accepts a viewport and zoom without any search text parameter', async () => {
    const dto = plainToInstance(MapEventsQueryDto, {
      west: 14.1,
      south: 49,
      east: 24.2,
      north: 54.9,
      zoom: MAP_MIN_ZOOM,
      week: 0,
      countWest: 14.5,
      countSouth: 49.2,
      countEast: 24,
      countNorth: 54.7
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto).not.toHaveProperty('search');
  });

  it('rejects zoom outside the supported map range', async () => {
    const dto = plainToInstance(MapEventsQueryDto, {
      west: 20,
      south: 51,
      east: 22,
      north: 53,
      zoom: MAP_MAX_ZOOM + 1
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('zoom');
  });
});
