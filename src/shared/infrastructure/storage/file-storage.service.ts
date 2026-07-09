import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import type { Express } from 'express';

export interface FileUploadResult {
  fileName: string;
  storagePath: string;
  url: string;
  size: number;
}

/**
 * FileStorageService
 * Abstraction layer for file storage that supports:
 * - MinIO (S3-compatible) for production
 * - Local disk storage for development
 *
 * In development mode (NODE_ENV !== 'production'), files are stored locally.
 * This allows easy testing without needing MinIO running.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly isProduction: boolean;
  private readonly localStoragePath: string;
  private minioClient: any;

  constructor(private configService: ConfigService) {
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    this.localStoragePath = this.configService.get<string>('LOCAL_STORAGE_PATH', './uploads');

    if (this.isProduction) {
      this.initializeMinIO();
    } else {
      this.initializeLocalStorage();
    }
  }

  /**
   * Initialize MinIO client for production
   */
  private initializeMinIO(): void {
    try {
      const { Client } = require('minio');
      const minioConfig = this.configService.get('minio');

      this.minioClient = new Client({
        endPoint: minioConfig.endPoint,
        port: minioConfig.port,
        useSSL: minioConfig.useSSL,
        accessKey: minioConfig.accessKey,
        secretKey: minioConfig.secretKey
      });

      this.logger.log('MinIO client initialized for production');
    } catch (error) {
      this.logger.error(`Failed to initialize MinIO: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Initialize local storage directory for development
   */
  private initializeLocalStorage(): void {
    try {
      if (!fs.existsSync(this.localStoragePath)) {
        fs.mkdirSync(this.localStoragePath, { recursive: true });
        this.logger.log(`Local storage directory created: ${this.localStoragePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize local storage: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Upload a file (avatar, image, etc.)
   * @param file Express file object
   * @param bucket Bucket/folder name ('avatars', 'media', etc.)
   * @returns FileUploadResult with URL and storage path
   */
  async uploadFile(file: Express.Multer.File, bucket: string = 'avatars'): Promise<FileUploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file
    this.validateFile(file);

    if (this.isProduction) {
      return this.uploadToMinIO(file, bucket);
    } else {
      return this.uploadToLocal(file, bucket);
    }
  }

  /**
   * Delete a file
   * @param storagePath Path returned from uploadFile
   */
  async deleteFile(storagePath: string): Promise<void> {
    if (!storagePath) return;

    if (this.isProduction) {
      await this.deleteFromMinIO(storagePath);
    } else {
      await this.deleteFromLocal(storagePath);
    }
  }

  /**
   * Get file URL (for local storage, returns relative path)
   */
  getFileUrl(storagePath: string): string {
    if (this.isProduction) {
      const minioConfig = this.configService.get('minio');
      return `http://${minioConfig.endPoint}:${minioConfig.port}/${storagePath}`;
    } else {
      // Local storage: return relative path for serving via static files
      return `/uploads/${storagePath}`;
    }
  }

  /**
   * Validate file before upload
   */
  private validateFile(file: Express.Multer.File): void {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed');
    }
  }

  /**
   * Upload to MinIO
   */
  private async uploadToMinIO(file: Express.Multer.File, bucket: string): Promise<FileUploadResult> {
    try {
      // Ensure bucket exists
      const bucketExists = await this.minioClient.bucketExists(bucket);
      if (!bucketExists) {
        await this.minioClient.makeBucket(bucket, 'us-east-1');
      }

      // Generate unique filename
      const fileName = this.generateFileName(file.originalname);
      const objectName = `${bucket}/${fileName}`;

      // Upload file
      await this.minioClient.putObject(bucket, fileName, file.buffer, file.size, {
        'Content-Type': file.mimetype
      });

      this.logger.log(`File uploaded to MinIO: ${objectName}`);

      return {
        fileName,
        storagePath: objectName,
        url: this.getFileUrl(objectName),
        size: file.size
      };
    } catch (error) {
      this.logger.error(`MinIO upload failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('File upload failed');
    }
  }

  /**
   * Upload to local storage
   */
  private async uploadToLocal(file: Express.Multer.File, bucket: string): Promise<FileUploadResult> {
    try {
      const bucketPath = path.join(this.localStoragePath, bucket);

      // Ensure bucket directory exists
      if (!fs.existsSync(bucketPath)) {
        fs.mkdirSync(bucketPath, { recursive: true });
      }

      // Generate unique filename
      const fileName = this.generateFileName(file.originalname);
      const filePath = path.join(bucketPath, fileName);
      const storagePath = `${bucket}/${fileName}`;

      // Write file
      fs.writeFileSync(filePath, file.buffer);

      this.logger.log(`File uploaded to local storage: ${filePath}`);

      return {
        fileName,
        storagePath,
        url: this.getFileUrl(storagePath),
        size: file.size
      };
    } catch (error) {
      this.logger.error(`Local storage upload failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('File upload failed');
    }
  }

  /**
   * Delete from MinIO
   */
  private async deleteFromMinIO(storagePath: string): Promise<void> {
    try {
      const [bucket, ...filePath] = storagePath.split('/');
      const objectName = filePath.join('/');

      await this.minioClient.removeObject(bucket, objectName);
      this.logger.log(`File deleted from MinIO: ${storagePath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete file from MinIO: ${(error as Error).message}`);
      // Don't throw - this is non-critical cleanup
    }
  }

  /**
   * Delete from local storage
   */
  private async deleteFromLocal(storagePath: string): Promise<void> {
    try {
      const filePath = path.join(this.localStoragePath, storagePath);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`File deleted from local storage: ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to delete file from local storage: ${(error as Error).message}`);
      // Don't throw - this is non-critical cleanup
    }
  }

  /**
   * Generate unique filename
   */
  private generateFileName(originalName: string): string {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    const ext = path.extname(originalName).toLowerCase();
    return `${timestamp}-${random}${ext}`;
  }
}
