import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { ProfileService } from './services/profile.service';
import { DrizzleModule } from '../../shared/infrastructure/drizzle.module';
import { StorageModule } from '../../shared/infrastructure/storage/storage.module';

/**
 * UserModule
 * Handles user profile management, authentication, and related features
 * - Personal profile CRUD
 * - Business profile management
 * - Avatar upload and storage
 * - Phone verification
 */
@Module({
  imports: [DrizzleModule, StorageModule],
  controllers: [UserController],
  providers: [ProfileService],
  exports: [ProfileService]
})
export class UserModule {}
