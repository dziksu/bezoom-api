export interface PhoneVerificationMessage {
  phoneNumber: string;
  recipientEmail: string;
  verificationCode: string;
  expiresInSeconds: number;
}

/** Transport port. Production will replace the development SMTP adapter with a real SMS provider. */
export abstract class PhoneVerificationDelivery {
  abstract send(message: PhoneVerificationMessage): Promise<void>;
}
