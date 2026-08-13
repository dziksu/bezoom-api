import {
  generatePhoneVerificationCode,
  hashPhoneVerificationCode,
  isPhoneVerificationCodeValid
} from './phone-verification';

describe('phone verification primitives', () => {
  it('generates a six digit code using the crypto API', () => {
    expect(generatePhoneVerificationCode()).toMatch(/^\d{6}$/);
  });

  it('stores and compares only a keyed hash', () => {
    const code = '012345';
    const hash = hashPhoneVerificationCode(code, 'test-secret');

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(code);
    expect(isPhoneVerificationCodeValid(code, hash, 'test-secret')).toBe(true);
    expect(isPhoneVerificationCodeValid('012346', hash, 'test-secret')).toBe(false);
    expect(isPhoneVerificationCodeValid(code, hash, 'another-secret')).toBe(false);
  });
});
