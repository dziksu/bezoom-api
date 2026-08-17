import { AccountTheme } from '../dto/user-settings.dto';
import { UserSettingsService } from './user-settings.service';

describe('UserSettingsService', () => {
  const profile = { id: '58f9c3c2-e0ee-4c20-a05a-df3f5ef22500' };
  const createdAt = new Date('2026-08-17T12:00:00.000Z');
  const defaults = {
    profileId: profile.id,
    theme: 'DARK',
    eventRemindersEnabled: true,
    nearbyEventsEnabled: true,
    socialActivityEnabled: false,
    language: 'pl',
    country: 'PL',
    currency: 'PLN',
    timeZone: 'Europe/Warsaw',
    createdAt,
    updatedAt: createdAt
  };

  it('creates and returns defaults on the first read', async () => {
    const returning = jest.fn().mockResolvedValue([defaults]);
    const insert = jest.fn(() => ({
      values: () => ({ onConflictDoNothing: () => ({ returning }) })
    }));
    const getMyProfile = jest.fn().mockResolvedValue(profile);
    const service = new UserSettingsService({ db: { insert } } as never, { getMyProfile } as never);

    await expect(service.getSettings('user-1')).resolves.toEqual({
      theme: AccountTheme.DARK,
      eventRemindersEnabled: true,
      nearbyEventsEnabled: true,
      socialActivityEnabled: false,
      language: 'pl',
      country: 'PL',
      currency: 'PLN',
      timeZone: 'Europe/Warsaw',
      createdAt,
      updatedAt: createdAt
    });
    expect(getMyProfile).toHaveBeenCalledWith('user-1', undefined, undefined, undefined, undefined, undefined);
  });

  it('upserts only supplied settings and preserves false values', async () => {
    let inserted: Record<string, unknown> = {};
    let conflictUpdate: Record<string, unknown> = {};
    const insert = jest.fn(() => ({
      values: (values: Record<string, unknown>) => {
        inserted = values;
        return {
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
            conflictUpdate = set;
            return { returning: jest.fn().mockResolvedValue([{ ...defaults, ...values }]) };
          }
        };
      }
    }));
    const service = new UserSettingsService(
      { db: { insert } } as never,
      { getMyProfile: jest.fn().mockResolvedValue(profile) } as never
    );

    const result = await service.updateSettings('user-1', {
      theme: AccountTheme.LIGHT,
      eventRemindersEnabled: false
    });

    expect(inserted).toEqual({ profileId: profile.id, theme: 'LIGHT', eventRemindersEnabled: false });
    expect(conflictUpdate).toMatchObject({ theme: 'LIGHT', eventRemindersEnabled: false });
    expect(conflictUpdate.updatedAt).toBeInstanceOf(Date);
    expect(conflictUpdate).not.toHaveProperty('nearbyEventsEnabled');
    expect(result).toMatchObject({
      theme: AccountTheme.LIGHT,
      eventRemindersEnabled: false,
      nearbyEventsEnabled: true
    });
  });
});
