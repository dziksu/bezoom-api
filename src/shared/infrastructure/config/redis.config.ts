import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => {
  const url = process.env.REDIS_URL || 'redis://:redis_dev@localhost:6379';
  const cacheUrl = process.env.REDIS_CACHE_URL || url;
  const rateLimitUrl = process.env.REDIS_RATE_LIMIT_URL || cacheUrl;
  const queueUrl = process.env.REDIS_QUEUE_URL || url;
  const parsedQueue = new URL(queueUrl);

  return {
    url,
    cacheUrl,
    rateLimitUrl,
    queueUrl,
    queueHost: process.env.REDIS_HOST || parsedQueue.hostname,
    queuePort: parseInt(process.env.REDIS_PORT || parsedQueue.port || '6379', 10),
    queuePassword:
      process.env.REDIS_PASSWORD || (parsedQueue.password ? decodeURIComponent(parsedQueue.password) : undefined),
    queueTls: parsedQueue.protocol === 'rediss:' ? {} : undefined
  };
});
