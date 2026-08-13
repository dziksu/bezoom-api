import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ProfileService } from './profile.service';
import type { PhoneVerificationMessage } from './phone-verification-delivery';

describe('ProfileService phone verification', () => {
  afterEach(() => jest.restoreAllMocks());

  it('persists only a hash with expiry and never logs the OTP', async () => {
    const profile = {
      keycloakSub: 'user-1',
      email: 'user@example.com',
      phoneVerificationSentAt: null
    };
    const writeLimit = jest.fn().mockResolvedValue([profile]);
    const writeSelect = jest.fn(() => ({
      from: () => ({ where: () => ({ limit: writeLimit }) })
    }));
    const readLimit = jest.fn().mockResolvedValue([]);
    const readSelect = jest.fn(() => ({
      from: () => ({ where: () => ({ limit: readLimit }) })
    }));
    const insert = jest.fn(() => ({
      values: () => ({ onConflictDoNothing: () => ({ returning: jest.fn().mockResolvedValue([]) }) })
    }));
    let persisted: Record<string, unknown> = {};
    const where = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn(() => ({
      set: (values: Record<string, unknown>) => {
        persisted = values;
        return { where };
      }
    }));
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const send = jest.fn<Promise<void>, [PhoneVerificationMessage]>().mockResolvedValue(undefined);
    const service = new ProfileService(
      { db: { insert, select: writeSelect, update } } as never,
      { db: { select: readSelect } } as never,
      {} as never,
      new ConfigService({ PHONE_VERIFICATION_HASH_SECRET: 'test-secret' }),
      { send },
      {} as never
    );

    const result = await service.requestPhoneVerification('user-1', { phoneNumber: '+48123456789' });

    expect(result).toEqual({ status: 'PHONE_VERIFICATION_CODE_SENT', expiresInSeconds: 600 });
    expect(persisted.phoneVerificationToken).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted.phoneVerificationExpiresAt).toBeInstanceOf(Date);
    expect(persisted.phoneVerificationAttempts).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    const delivered = send.mock.calls[0][0];
    expect(delivered).toMatchObject({
      phoneNumber: '+48123456789',
      recipientEmail: 'user@example.com',
      expiresInSeconds: 600
    });
    expect(delivered.verificationCode).toMatch(/^\d{6}$/);
    expect(persisted.phoneVerificationToken).not.toBe(delivered.verificationCode);
    expect(log).toHaveBeenCalledWith('PHONE_VERIFICATION_REQUESTED');
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/\b\d{6}\b/);
  });

  it('never exposes IdP, email or phone-verification data in a public profile', async () => {
    const profile = {
      id: 'f3296b7d-3a11-4c9d-8755-0df8fe781748',
      keycloakSub: 'private-idp-subject',
      accountType: 'personal',
      firstName: 'Jan',
      lastName: 'Kowalski',
      username: 'jan',
      email: 'jan@example.com',
      phoneNumber: '+48123456789',
      isPhoneVerified: true,
      bio: 'Public bio',
      avatarUrl: null,
      interests: ['music'],
      followersCount: 2,
      followingCount: 3,
      isPrivate: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    };
    const limit = jest.fn().mockResolvedValue([profile]);
    const select = jest.fn(() => ({
      from: () => ({ where: () => ({ limit }) })
    }));
    const service = new ProfileService(
      {} as never,
      { db: { select } } as never,
      {} as never,
      new ConfigService(),
      {} as never,
      { isBlockedBetween: jest.fn().mockResolvedValue(false) } as never
    );

    const result = await service.getProfileById(profile.id);

    expect(result).toMatchObject({ id: profile.id, username: 'jan', bio: 'Public bio' });
    expect(result).not.toHaveProperty('keycloakSub');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('phoneNumber');
    expect(result).not.toHaveProperty('isPhoneVerified');
  });
});
