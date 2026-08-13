import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => {
  const url = process.env.REDIS_URL || 'redis://:redis_dev@localhost:6379';
  const parsed = new URL(url);

  return {
    url,
    host: process.env.REDIS_HOST || parsed.hostname,
    port: parseInt(process.env.REDIS_PORT || parsed.port || '6379', 10),
    password: process.env.REDIS_PASSWORD || (parsed.password ? decodeURIComponent(parsed.password) : undefined)
  };
});
