import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const PHONE_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const PHONE_VERIFICATION_COOLDOWN_MS = 60 * 1000;
export const PHONE_VERIFICATION_MAX_ATTEMPTS = 5;

export function generatePhoneVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashPhoneVerificationCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code, 'utf8').digest('hex');
}

export function isPhoneVerificationCodeValid(code: string, expectedHash: string, secret: string): boolean {
  const actual = Buffer.from(hashPhoneVerificationCode(code, secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
