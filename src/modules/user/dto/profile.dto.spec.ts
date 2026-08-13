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
});
