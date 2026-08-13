import { Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';

/**
 * StorageModule
 * Provides one S3-compatible storage abstraction for MinIO and R2.
 */
@Module({
  providers: [ObjectStorageService],
  exports: [ObjectStorageService]
})
export class StorageModule {}
