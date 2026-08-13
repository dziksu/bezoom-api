import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ProfileService } from './profile.service';

describe('ProfileService phone verification', () => {
  afterEach(() => jest.restoreAllMocks());

  it('persists only a hash with expiry and never logs the OTP', async () => {
    const profile = {
      keycloakSub: 'user-1',
      phoneVerificationSentAt: null
    };
    const limit = jest.fn().mockResolvedValueOnce([profile]).mockResolvedValueOnce([]);
    const select = jest.fn(() => ({
      from: () => ({ where: () => ({ limit }) })
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
    const service = new ProfileService(
      { db: { update } } as never,
      { db: { select } } as never,
      {} as never,
      new ConfigService({ PHONE_VERIFICATION_HASH_SECRET: 'test-secret' })
    );

    const result = await service.requestPhoneVerification('user-1', { phoneNumber: '+48123456789' });

    expect(result).toEqual({ status: 'PHONE_VERIFICATION_CODE_SENT', expiresInSeconds: 600 });
    expect(persisted.phoneVerificationToken).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted.phoneVerificationExpiresAt).toBeInstanceOf(Date);
    expect(persisted.phoneVerificationAttempts).toBe(0);
    expect(log).toHaveBeenCalledWith('Phone verification requested for user: user-1');
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/\b\d{6}\b/);
  });
});
