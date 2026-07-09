import { registerAs } from '@nestjs/config';

export default registerAs('minio', () => ({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin_dev',
  useSSL: process.env.MINIO_USE_SSL === 'true',
  rawBucket: process.env.MINIO_RAW_BUCKET || 'raw-uploads',
  mediaBucket: process.env.MINIO_MEDIA_BUCKET || 'media'
}));
