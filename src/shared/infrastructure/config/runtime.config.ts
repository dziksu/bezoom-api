import { registerAs } from '@nestjs/config';

export type ProcessRole = 'api' | 'worker' | 'all';

export interface RuntimeConfig {
  processRole: ProcessRole;
  outboxRetentionDays: number;
}

export function backgroundWorkersEnabled(config: RuntimeConfig | undefined): boolean {
  return (config?.processRole ?? 'all') !== 'api';
}

export default registerAs('runtime', (): RuntimeConfig => {
  const processRole = process.env.PROCESS_ROLE ?? 'all';
  if (!['api', 'worker', 'all'].includes(processRole)) throw new Error('PROCESS_ROLE_INVALID');

  const retention = Number(process.env.EVENT_OUTBOX_RETENTION_DAYS ?? 7);
  if (!Number.isInteger(retention) || retention < 1 || retention > 365) {
    throw new Error('EVENT_OUTBOX_RETENTION_DAYS_INVALID');
  }

  return {
    processRole: processRole as ProcessRole,
    outboxRetentionDays: retention
  };
});
