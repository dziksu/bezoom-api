import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AccountTheme, UpdateUserSettingsDto } from './user-settings.dto';

describe('UpdateUserSettingsDto', () => {
  const transform = (value: Record<string, unknown>) =>
    plainToInstance(UpdateUserSettingsDto, value, { enableImplicitConversion: true });

  it('normalizes standardized setting values', async () => {
    const dto = transform({
      theme: ' dark ',
      language: 'pl-pl',
      country: 'pl',
      currency: 'pln',
      timeZone: ' Europe/Warsaw '
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      theme: AccountTheme.DARK,
      language: 'pl-PL',
      country: 'PL',
      currency: 'PLN',
      timeZone: 'Europe/Warsaw'
    });
  });

  it('accepts actual booleans and rejects boolean-like strings', async () => {
    expect(await validate(transform({ eventRemindersEnabled: false }))).toHaveLength(0);
    expect(await validate(transform({ eventRemindersEnabled: 'false' }))).not.toHaveLength(0);
  });

  it('rejects unsupported themes and invalid regional values', async () => {
    const errors = await validate(
      transform({ theme: 'SYSTEM', language: 'polish', country: 'XX', currency: 'INVALID', timeZone: 'Warsaw' })
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['theme', 'language', 'country', 'currency', 'timeZone'])
    );
  });
});
