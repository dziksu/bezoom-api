import { SetMetadata } from '@nestjs/common';

export const OPTIONAL_AUTH_ROUTE = 'auth:optional';
/** Anonymous access is allowed; a supplied bearer token is still verified and mapped. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_ROUTE, true);
