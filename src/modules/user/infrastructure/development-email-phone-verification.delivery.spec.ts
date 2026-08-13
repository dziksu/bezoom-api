import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevelopmentEmailPhoneVerificationDelivery } from './development-email-phone-verification.delivery';

describe('DevelopmentEmailPhoneVerificationDelivery', () => {
  const message = {
    phoneNumber: '+48500123456',
    recipientEmail: 'user@example.com',
    verificationCode: '123456',
    expiresInSeconds: 600
  };

  it('fails closed in production even if development email mode was configured', async () => {
    const delivery = new DevelopmentEmailPhoneVerificationDelivery(
      new ConfigService({
        NODE_ENV: 'production',
        phoneDelivery: {
          mode: 'development_email',
          smtpHost: 'mailpit',
          smtpPort: 1025,
          fromEmail: 'sms@bezoom.local'
        }
      })
    );

    await expect(delivery.send(message)).rejects.toMatchObject({
      response: { message: 'PHONE_VERIFICATION_SMS_NOT_CONFIGURED' }
    });
  });

  it('rejects header injection before opening an SMTP connection', async () => {
    const delivery = new DevelopmentEmailPhoneVerificationDelivery(
      new ConfigService({
        NODE_ENV: 'development',
        phoneDelivery: {
          mode: 'development_email',
          smtpHost: 'mailpit',
          smtpPort: 1025,
          fromEmail: 'sms@bezoom.local'
        }
      })
    );

    await expect(
      delivery.send({ ...message, recipientEmail: 'user@example.com\r\nBcc: attacker@example.com' })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
