import { Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';

/**
 * StorageModule
 * Provides file storage abstraction layer
 * - MinIO for production S3-compatible storage
 * - Local disk storage for development
 */
@Module({
  providers: [FileStorageService],
  exports: [FileStorageService]
})
export class StorageModule {}
