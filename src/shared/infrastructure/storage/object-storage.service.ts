import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import type { MinioConfig } from '../config/minio.config';

export interface ObjectStat {
  size: number;
  mimeType?: string;
}

/**
 * Presigned-URL / server-side object storage operations against MinIO.
 *
 * Uses the same S3-compatible API for local MinIO and production object storage.
 */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: MinioClient;
  private readonly presignClient: MinioClient;

  readonly rawBucket: string;
  readonly mediaBucket: string;
  readonly avatarBucket: string;
  private readonly publicUrl?: string;
  private readonly endPoint: string;
  private readonly port: number;
  private readonly useSSL: boolean;

  constructor(private readonly configService: ConfigService) {
    const minioConfig = this.configService.get<MinioConfig>('minio');
    if (!minioConfig) throw new Error('OBJECT_STORAGE_NOT_CONFIGURED');

    this.endPoint = minioConfig.endPoint;
    this.port = minioConfig.port;
    this.useSSL = minioConfig.useSSL;
    this.rawBucket = minioConfig.rawBucket;
    this.mediaBucket = minioConfig.mediaBucket;
    this.avatarBucket = minioConfig.avatarBucket;
    this.publicUrl = minioConfig.publicUrl;

    this.client = new MinioClient({
      endPoint: this.endPoint,
      port: this.port,
      useSSL: this.useSSL,
      accessKey: minioConfig.accessKey,
      secretKey: minioConfig.secretKey
    });
    this.presignClient = new MinioClient({
      endPoint: minioConfig.presignEndPoint,
      port: minioConfig.presignPort,
      useSSL: minioConfig.presignUseSSL,
      accessKey: minioConfig.accessKey,
      secretKey: minioConfig.secretKey,
      // Avoid a bucket-location network lookup through a client-facing hostname.
      region: 'us-east-1'
    });
  }

  /** Presigned PUT URL a client can upload directly to, bypassing the API for the payload. */
  async getPresignedPutUrl(bucket: string, key: string, ttlSeconds = 900): Promise<string> {
    return this.presignClient.presignedPutObject(bucket, key, ttlSeconds);
  }

  /** Returns stat for an object, or `null` if it doesn't exist. */
  async statObject(bucket: string, key: string): Promise<ObjectStat | null> {
    try {
      const stat = await this.client.statObject(bucket, key);
      const rawMimeType: unknown = stat.metaData?.['content-type'];
      return { size: stat.size, mimeType: typeof rawMimeType === 'string' ? rawMimeType : undefined };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'NotFound' || code === 'NoSuchKey') {
        return null;
      }
      this.logger.error('OBJECT_STORAGE_STAT_FAILED');
      throw error;
    }
  }

  async ping(): Promise<void> {
    const [rawBucketExists, mediaBucketExists, avatarBucketExists] = await Promise.all([
      this.client.bucketExists(this.rawBucket),
      this.client.bucketExists(this.mediaBucket),
      this.client.bucketExists(this.avatarBucket)
    ]);
    if (!rawBucketExists || !mediaBucketExists || !avatarBucketExists) {
      throw new Error('OBJECT_STORAGE_BUCKET_UNAVAILABLE');
    }
  }

  async putObject(bucket: string, key: string, body: Buffer, metadata: Record<string, string> = {}): Promise<void> {
    await this.client.putObject(bucket, key, body, body.length, metadata);
  }

  async removeObject(bucket: string, key: string): Promise<void> {
    await this.client.removeObject(bucket, key);
  }

  /** Server-side copy between buckets (used to move a confirmed photo from raw-uploads to media). */
  async copyObject(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string): Promise<void> {
    await this.client.copyObject(dstBucket, dstKey, `/${srcBucket}/${srcKey}`);
  }

  /** Public URL for an object in a public-serving bucket (e.g. the media bucket). */
  getPublicUrl(bucket: string, key: string): string {
    // Seed data may point at a stable external stock-photo CDN instead of
    // duplicating those assets in local object storage.
    if (key.startsWith('https://')) return key;
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/$/, '')}/${bucket}/${key}`;
    }
    const protocol = this.useSSL ? 'https' : 'http';
    return `${protocol}://${this.endPoint}:${this.port}/${bucket}/${key}`;
  }
}
