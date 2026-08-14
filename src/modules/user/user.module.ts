import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { ProfileService } from './services/profile.service';
import { DrizzleModule } from '../../shared/infrastructure/drizzle.module';
import { StorageModule } from '../../shared/infrastructure/storage/storage.module';
import { PhoneVerificationDelivery } from './services/phone-verification-delivery';
import { DevelopmentEmailPhoneVerificationDelivery } from './infrastructure/development-email-phone-verification.delivery';
import { SafetyModule } from '../safety/safety.module';
import { AccountController } from './account.controller';
import { AccountLifecycleService } from './services/account-lifecycle.service';
import { KeycloakAccountManagementService } from './infrastructure/keycloak-account-management.service';
import { AccountDeletionWorker } from './services/account-deletion.worker';

/**
 * UserModule
 * Handles user profile management, authentication, and related features
 * - Personal profile CRUD
 * - Business profile management
 * - Avatar upload and storage
 * - Phone verification
 */
@Module({
  imports: [DrizzleModule, StorageModule, SafetyModule],
  controllers: [UserController, AccountController],
  providers: [
    ProfileService,
    AccountLifecycleService,
    AccountDeletionWorker,
    KeycloakAccountManagementService,
    DevelopmentEmailPhoneVerificationDelivery,
    { provide: PhoneVerificationDelivery, useExisting: DevelopmentEmailPhoneVerificationDelivery }
  ],
  exports: [ProfileService]
})
export class UserModule {}
