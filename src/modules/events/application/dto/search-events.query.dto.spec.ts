import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GEO_SEARCH_MAX_LIMIT, GEO_SEARCH_MAX_PAGE, SearchEventsQueryDto } from './search-events.query.dto';

describe('SearchEventsQueryDto', () => {
  it('bounds offset pagination to protect the geo discovery hot path', async () => {
    const dto = plainToInstance(SearchEventsQueryDto, {
      lat: 50.0647,
      lng: 19.945,
      page: GEO_SEARCH_MAX_PAGE + 1,
      limit: GEO_SEARCH_MAX_LIMIT + 1
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property).sort()).toEqual(['limit', 'page']);
    expect(errors.every((error) => error.constraints?.max)).toBe(true);
  });

  it('accepts the maximum bounded page and limit', async () => {
    const dto = plainToInstance(SearchEventsQueryDto, {
      lat: 50.0647,
      lng: 19.945,
      page: GEO_SEARCH_MAX_PAGE,
      limit: GEO_SEARCH_MAX_LIMIT
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});
