import { registerAs } from '@nestjs/config';

export interface AccountLifecycleConfig {
  keycloakInternalUrl: string;
  keycloakPublicUrl: string;
  realm: string;
  managementClientId: string;
  managementClientSecret: string;
  accountConsoleClientId: string;
  accountReturnUrl: string;
  deletionGraceDays: number;
  workerIntervalMs: number;
}

export default registerAs('accountLifecycle', (): AccountLifecycleConfig => ({
  keycloakInternalUrl: process.env.KEYCLOAK_INTERNAL_URL || process.env.KEYCLOAK_URL || 'http://localhost:8080',
  keycloakPublicUrl: process.env.KEYCLOAK_PUBLIC_URL || process.env.KEYCLOAK_URL || 'http://localhost:8080',
  realm: process.env.KEYCLOAK_REALM || 'bezoom',
  managementClientId: process.env.KEYCLOAK_ACCOUNT_MANAGEMENT_CLIENT_ID || 'bezoom-account-lifecycle',
  managementClientSecret: process.env.KEYCLOAK_ACCOUNT_MANAGEMENT_CLIENT_SECRET || '',
  accountConsoleClientId: process.env.KEYCLOAK_ACCOUNT_CONSOLE_CLIENT_ID || 'bezoom-web',
  accountReturnUrl: process.env.KEYCLOAK_ACCOUNT_RETURN_URL || 'http://localhost:3000/account',
  deletionGraceDays: Math.max(1, Number(process.env.ACCOUNT_DELETION_GRACE_DAYS || 30)),
  workerIntervalMs: Math.max(1_000, Number(process.env.ACCOUNT_DELETION_WORKER_INTERVAL_MS || 30_000))
}));
