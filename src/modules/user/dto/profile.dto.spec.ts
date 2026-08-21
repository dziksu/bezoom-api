import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './profile.dto';

describe('UpdateProfileDto', () => {
  const transform = (value: Record<string, unknown>) =>
    plainToInstance(UpdateProfileDto, value, { enableImplicitConversion: true });

  it('normalizes the onboarding username before validation', async () => {
    const dto = transform({ username: '  New_User-1  ' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.username).toBe('new_user-1');
  });

  it('accepts only a real boolean for privacy', async () => {
    expect(await validate(transform({ isPrivate: false }))).toHaveLength(0);
    expect(await validate(transform({ isPrivate: 'false' }))).not.toHaveLength(0);
  });

  it('accepts unique event categories', async () => {
    const dto = transform({
      favoriteCategories: ['MUSIC_AND_NIGHTLIFE', 'ARTS_AND_CULTURE']
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    [['music'], 'an arbitrary tag'],
    [['MUSIC_AND_NIGHTLIFE', 'MUSIC_AND_NIGHTLIFE'], 'duplicates']
  ])('rejects %s (%s)', async (favoriteCategories) => {
    const dto = transform({ favoriteCategories });

    const errors = await validate(dto);

    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'favoriteCategories' })]));
  });
});
