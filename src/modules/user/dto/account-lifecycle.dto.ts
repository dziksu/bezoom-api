import { ApiProperty } from '@nestjs/swagger';

export const accountStatuses = ['ACTIVE', 'DEACTIVATED', 'PENDING_DELETION', 'ANONYMIZED'] as const;
export type AccountStatus = (typeof accountStatuses)[number];

export class AccountLifecycleResponseDto {
  @ApiProperty({ enum: accountStatuses })
  status: AccountStatus;

  @ApiProperty({ required: false })
  deletionScheduledAt?: Date;

  @ApiProperty({
    description:
      'Keycloak Account Console URL for email, first/last name, password, MFA, sessions and linked identities.'
  })
  accountConsoleUrl: string;

  @ApiProperty({
    type: [String],
    enum: ['EMAIL', 'FIRST_NAME', 'LAST_NAME', 'PASSWORD', 'MFA', 'SESSIONS', 'LINKED_IDENTITIES']
  })
  managedByKeycloak: Array<
    'EMAIL' | 'FIRST_NAME' | 'LAST_NAME' | 'PASSWORD' | 'MFA' | 'SESSIONS' | 'LINKED_IDENTITIES'
  >;
}
