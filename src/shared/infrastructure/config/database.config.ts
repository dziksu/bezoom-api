import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL || 'postgresql://bezoom:bezoom_dev@localhost:5432/bezoom',
  readUrl: process.env.DATABASE_READ_URL || undefined,
  maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '10', 10),
  ssl: process.env.DATABASE_SSL === 'true'
}));
