import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/schema/*',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://bezoom:bezoom_dev@localhost:5432/bezoom'
  }
} satisfies Config;
