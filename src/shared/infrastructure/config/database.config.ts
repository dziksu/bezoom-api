import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL || 'postgresql://bezoom:bezoom_dev@localhost:5432/bezoom',
  readUrl: process.env.DATABASE_READ_URL || undefined,
  readMaxConnections: parseInt(
    process.env.DATABASE_READ_MAX_CONNECTIONS || process.env.DATABASE_MAX_CONNECTIONS || '10',
    10
  ),
  writeMaxConnections: parseInt(
    process.env.DATABASE_WRITE_MAX_CONNECTIONS || process.env.DATABASE_MAX_CONNECTIONS || '10',
    10
  ),
  connectionTimeoutMs: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '2000', 10),
  idleTimeoutMs: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
  statementTimeoutMs: parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS || '5000', 10),
  queryTimeoutMs: parseInt(process.env.DATABASE_QUERY_TIMEOUT_MS || '5500', 10),
  ssl: process.env.DATABASE_SSL === 'true'
}));
