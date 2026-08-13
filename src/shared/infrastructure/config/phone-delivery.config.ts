import { registerAs } from '@nestjs/config';

export type PhoneDeliveryMode = 'development_email' | 'sms';

export interface PhoneDeliveryConfig {
  mode: PhoneDeliveryMode;
  smtpHost: string;
  smtpPort: number;
  fromEmail: string;
}

export default registerAs('phoneDelivery', (): PhoneDeliveryConfig => {
  const mode =
    process.env.PHONE_VERIFICATION_DELIVERY_MODE ??
    (process.env.NODE_ENV === 'production' ? 'sms' : 'development_email');
  const smtpPort = Number(process.env.DEV_SMS_SMTP_PORT || 1025);

  if (mode !== 'development_email' && mode !== 'sms') {
    throw new Error('PHONE_VERIFICATION_DELIVERY_MODE_INVALID');
  }
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65_535) {
    throw new Error('DEV_SMS_SMTP_PORT_INVALID');
  }

  return {
    mode,
    smtpHost: process.env.DEV_SMS_SMTP_HOST || 'localhost',
    smtpPort,
    fromEmail: process.env.DEV_SMS_FROM_EMAIL || 'sms@bezoom.local'
  };
});
