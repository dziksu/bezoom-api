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
 * Unlike `FileStorageService` (which switches to local disk in dev), this service always
 * talks to a real MinIO endpoint — presigned URLs are meaningless against local disk, and
 * docker-compose provides MinIO in dev too.
 */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: MinioClient;

  readonly rawBucket: string;
  readonly mediaBucket: string;
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
    this.publicUrl = minioConfig.publicUrl;

    this.client = new MinioClient({
      endPoint: this.endPoint,
      port: this.port,
      useSSL: this.useSSL,
      accessKey: minioConfig.accessKey,
      secretKey: minioConfig.secretKey
    });
  }

  /** Presigned PUT URL a client can upload directly to, bypassing the API for the payload. */
  async getPresignedPutUrl(bucket: string, key: string, ttlSeconds = 900): Promise<string> {
    return this.client.presignedPutObject(bucket, key, ttlSeconds);
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
      this.logger.error(`statObject failed for ${bucket}/${key}: ${(error as Error).message}`);
      throw error;
    }
  }

  async ping(): Promise<void> {
    const [rawBucketExists, mediaBucketExists] = await Promise.all([
      this.client.bucketExists(this.rawBucket),
      this.client.bucketExists(this.mediaBucket)
    ]);
    if (!rawBucketExists || !mediaBucketExists) {
      throw new Error('OBJECT_STORAGE_BUCKET_UNAVAILABLE');
    }
  }

  /** Server-side copy between buckets (used to move a confirmed photo from raw-uploads to media). */
  async copyObject(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string): Promise<void> {
    await this.client.copyObject(dstBucket, dstKey, `/${srcBucket}/${srcKey}`);
  }

  /** Public URL for an object in a public-serving bucket (e.g. the media bucket). */
  getPublicUrl(bucket: string, key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/$/, '')}/${bucket}/${key}`;
    }
    const protocol = this.useSSL ? 'https' : 'http';
    return `${protocol}://${this.endPoint}:${this.port}/${bucket}/${key}`;
  }
}
