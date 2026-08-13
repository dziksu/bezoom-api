import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GEO_SEARCH_MAX_LIMIT, SearchEventsQueryDto } from './search-events.query.dto';

describe('SearchEventsQueryDto', () => {
  it('bounds the infinite-scroll batch and cursor size', async () => {
    const dto = plainToInstance(SearchEventsQueryDto, {
      lat: 50.0647,
      lng: 19.945,
      cursor: 'x'.repeat(1025),
      limit: GEO_SEARCH_MAX_LIMIT + 1
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property).sort()).toEqual(['cursor', 'limit']);
  });

  it('accepts a bounded cursor batch', async () => {
    const dto = plainToInstance(SearchEventsQueryDto, {
      lat: 50.0647,
      lng: 19.945,
      cursor: 'opaque-cursor',
      limit: GEO_SEARCH_MAX_LIMIT
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});
