import { Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';
import { ObjectStorageService } from './object-storage.service';

/**
 * StorageModule
 * Provides file storage abstraction layer
 * - FileStorageService: MinIO for production S3-compatible storage, local disk in dev
 * - ObjectStorageService: presigned-URL MinIO operations (always real MinIO, dev included)
 */
@Module({
  providers: [FileStorageService, ObjectStorageService],
  exports: [FileStorageService, ObjectStorageService]
})
export class StorageModule {}
