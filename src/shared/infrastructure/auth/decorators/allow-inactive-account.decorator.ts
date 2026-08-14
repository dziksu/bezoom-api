import { SetMetadata } from '@nestjs/common';

export const ALLOW_INACTIVE_ACCOUNT = 'account:allow-inactive';
export const AllowInactiveAccount = () => SetMetadata(ALLOW_INACTIVE_ACCOUNT, true);
