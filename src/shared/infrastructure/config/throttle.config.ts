import { registerAs } from '@nestjs/config';

export default registerAs('throttle', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
  limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  // Keep 0 for direct traffic. Set to the exact proxy hop count behind an ingress.
  trustProxyHops: parseInt(process.env.TRUST_PROXY_HOPS || '0', 10)
}));
