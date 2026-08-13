import { connect } from 'node:net';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PhoneDeliveryConfig } from '@api/shared/infrastructure/config/phone-delivery.config';
import { PhoneVerificationDelivery, type PhoneVerificationMessage } from '../services/phone-verification-delivery';

@Injectable()
export class DevelopmentEmailPhoneVerificationDelivery extends PhoneVerificationDelivery {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async send(message: PhoneVerificationMessage): Promise<void> {
    const delivery = this.config.get<PhoneDeliveryConfig>('phoneDelivery');
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (!delivery || delivery.mode !== 'development_email' || nodeEnv === 'production') {
      throw new ServiceUnavailableException('PHONE_VERIFICATION_SMS_NOT_CONFIGURED');
    }
    this.assertHeader(delivery.fromEmail);
    this.assertHeader(message.recipientEmail);

    const subject = 'Bezoom development SMS verification';
    const body = [
      'DEVELOPMENT SMS SIMULATION',
      `Phone: ${message.phoneNumber}`,
      `Verification code: ${message.verificationCode}`,
      `Expires in: ${message.expiresInSeconds} seconds`
    ].join('\r\n');
    const data = [
      `From: Bezoom SMS <${delivery.fromEmail}>`,
      `To: ${message.recipientEmail}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=UTF-8',
      'MIME-Version: 1.0',
      '',
      body.replace(/^\./gm, '..'),
      '.'
    ].join('\r\n');

    await this.smtp(delivery.smtpHost, delivery.smtpPort, delivery.fromEmail, message.recipientEmail, data);
  }

  private smtp(host: string, port: number, from: string, recipient: string, data: string): Promise<void> {
    const stages = [
      { expected: 220, command: 'EHLO bezoom-api\r\n' },
      { expected: 250, command: `MAIL FROM:<${from}>\r\n` },
      { expected: 250, command: `RCPT TO:<${recipient}>\r\n` },
      { expected: 250, command: 'DATA\r\n' },
      { expected: 354, command: `${data}\r\n` },
      { expected: 250, command: 'QUIT\r\n' },
      { expected: 221, command: undefined }
    ];

    return new Promise((resolve, reject) => {
      const socket = connect({ host, port });
      let buffer = '';
      let stage = 0;
      const fail = () => {
        socket.destroy();
        reject(new ServiceUnavailableException('PHONE_VERIFICATION_DELIVERY_FAILED'));
      };

      socket.setTimeout(3_000, fail);
      socket.on('error', fail);
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\r\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const final = /^(\d{3}) /.exec(line);
          if (!final) continue;
          const current = stages[stage];
          if (!current || Number(final[1]) !== current.expected) return fail();
          stage += 1;
          if (current.command) socket.write(current.command);
          if (stage === stages.length) {
            socket.end();
            resolve();
          }
        }
      });
    });
  }

  private assertHeader(value: string): void {
    if (!value || /[\r\n]/.test(value)) {
      throw new ServiceUnavailableException('PHONE_VERIFICATION_DELIVERY_FAILED');
    }
  }
}
