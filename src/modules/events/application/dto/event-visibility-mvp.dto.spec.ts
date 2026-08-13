import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventDto } from './create-event.dto';
import { UpdateEventDto } from './update-event.dto';

describe('MVP event visibility contract', () => {
  it.each(['PUBLIC', 'PRIVATE'])('rejects visibility=%s during event creation', async (visibility) => {
    const dto = plainToInstance(CreateEventDto, {
      title: 'Public event',
      description: 'This description is intentionally longer than fifty characters for validation.',
      category: 'MUSIC_AND_NIGHTLIFE',
      startDate: new Date(Date.now() + 86_400_000).toISOString(),
      location: { latitude: 50.0647, longitude: 19.945 },
      priceType: 'FREE',
      photoIds: ['d45f5bb8-bf19-4a6f-bbab-61e338e12262'],
      visibility
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.map((error) => error.property)).toContain('visibility');
  });

  it.each(['PUBLIC', 'PRIVATE'])('rejects visibility=%s during event editing', async (visibility) => {
    const dto = plainToInstance(UpdateEventDto, { title: 'Updated public event', visibility });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.map((error) => error.property)).toContain('visibility');
  });
});
