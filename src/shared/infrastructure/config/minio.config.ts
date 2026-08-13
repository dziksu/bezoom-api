import { registerAs } from '@nestjs/config';

export interface MinioConfig {
  endPoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
  rawBucket: string;
  mediaBucket: string;
  publicUrl?: string;
  presignEndPoint: string;
  presignPort: number;
  presignUseSSL: boolean;
}

export default registerAs('minio', (): MinioConfig => ({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin_dev',
  useSSL: process.env.MINIO_USE_SSL === 'true',
  rawBucket: process.env.MINIO_RAW_BUCKET || 'raw-uploads',
  mediaBucket: process.env.MINIO_MEDIA_BUCKET || 'media',
  // Public-facing host for serving media (e.g. a CDN or reverse-proxy in front of MinIO).
  // Falls back to the direct MinIO endpoint if unset.
  publicUrl: process.env.MINIO_PUBLIC_URL || undefined,
  // The API may connect through the Docker DNS name while clients need a public host.
  presignEndPoint: process.env.MINIO_PRESIGN_ENDPOINT || process.env.MINIO_ENDPOINT || 'localhost',
  presignPort: parseInt(process.env.MINIO_PRESIGN_PORT || process.env.MINIO_PORT || '9000', 10),
  presignUseSSL: (process.env.MINIO_PRESIGN_USE_SSL || process.env.MINIO_USE_SSL) === 'true'
}));
