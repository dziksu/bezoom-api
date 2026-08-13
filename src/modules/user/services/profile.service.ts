import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { profiles } from '@api/shared/infrastructure/database/schema/profiles';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import {
  UpdateProfileDto,
  CreateBusinessProfileDto,
  UpdateBusinessProfileDto,
  RequestPhoneVerificationDto,
  VerifyPhoneDto,
  VerifyBusinessDto,
  ProfileResponseDto,
  PublicProfileResponseDto
} from '../dto/profile.dto';
import {
  generatePhoneVerificationCode,
  hashPhoneVerificationCode,
  isPhoneVerificationCodeValid,
  PHONE_VERIFICATION_CODE_TTL_MS,
  PHONE_VERIFICATION_COOLDOWN_MS,
  PHONE_VERIFICATION_MAX_ATTEMPTS
} from './phone-verification';
import { PhoneVerificationDelivery } from './phone-verification-delivery';
import { UserBlockRepository } from '@api/modules/safety/domain/user-block.repository';
import { AVATAR_MAX_BYTES, detectAvatarImage } from './avatar-image';

type ProfileRecord = typeof profiles.$inferSelect;

/**
 * ProfileService
 * Handles all profile-related operations:
 * - Personal profile management
 * - Business profile management
 * - Avatar upload and deletion
 * - Phone verification
 * - Profile verification
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly drizzleWrite: DrizzleWriteService,
    private readonly drizzleRead: DrizzleReadService,
    private readonly objectStorage: ObjectStorageService,
    private readonly config: ConfigService,
    private readonly phoneVerificationDelivery: PhoneVerificationDelivery,
    private readonly userBlocks: UserBlockRepository
  ) {}

  /**
   * Get profile by Keycloak sub
   * Used internally and for response mapping
   */
  async getProfileBySub(keycloakSub: string): Promise<ProfileRecord> {
    const result = await this.drizzleRead.db
      .select()
      .from(profiles)
      .where(eq(profiles.keycloakSub, keycloakSub))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('PROFILE_NOT_FOUND');
    }

    return result[0];
  }

  /** Atomically provisions the personal profile on the first authenticated request. */
  private async ensureProfile(keycloakSub: string, email?: string): Promise<ProfileRecord> {
    const [created] = await this.drizzleWrite.db
      .insert(profiles)
      .values({ keycloakSub, email: email || null, accountType: 'personal' })
      .onConflictDoNothing({ target: profiles.keycloakSub })
      .returning();
    if (created) {
      this.logger.log('PROFILE_CREATED');
      return created;
    }

    const [existing] = await this.drizzleWrite.db
      .select()
      .from(profiles)
      .where(eq(profiles.keycloakSub, keycloakSub))
      .limit(1);
    if (!existing) throw new NotFoundException('PROFILE_NOT_FOUND');

    if (email && existing.email !== email) {
      const [synced] = await this.drizzleWrite.db
        .update(profiles)
        .set({ email, updatedAt: new Date() })
        .where(eq(profiles.keycloakSub, keycloakSub))
        .returning();
      return synced;
    }

    return existing;
  }

  /**
   * Get profile by ID (public lookup)
   */
  async getProfileById(profileId: string, viewerKeycloakSub?: string): Promise<PublicProfileResponseDto> {
    const result = await this.drizzleRead.db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);

    if (result.length === 0) {
      throw new NotFoundException('PROFILE_NOT_FOUND');
    }

    const profile = result[0];
    if (viewerKeycloakSub && (await this.userBlocks.isBlockedBetween(viewerKeycloakSub, profile.keycloakSub))) {
      throw new NotFoundException('PROFILE_NOT_FOUND');
    }

    return this.toPublicResponseDto(profile);
  }

  /**
   * Get authenticated user's profile
   */
  async getMyProfile(keycloakSub: string, email?: string): Promise<ProfileResponseDto> {
    return this.toResponseDto(await this.ensureProfile(keycloakSub, email));
  }

  /**
   * Create a new profile (called after user registration)
   * Creates a personal profile by default
   */
  async createProfile(
    keycloakSub: string,
    email: string,
    firstName?: string,
    lastName?: string
  ): Promise<ProfileResponseDto> {
    const profile = await this.ensureProfile(keycloakSub, email);
    if (!firstName && !lastName) return this.toResponseDto(profile);
    const [updated] = await this.drizzleWrite.db
      .update(profiles)
      .set({ firstName: firstName ?? profile.firstName, lastName: lastName ?? profile.lastName, updatedAt: new Date() })
      .where(eq(profiles.keycloakSub, keycloakSub))
      .returning();
    return this.toResponseDto(updated);
  }

  /**
   * Verify or reject a business profile.
   */
  private async verifyBusinessProfile(profileId: string, verifyDto: VerifyBusinessDto): Promise<ProfileResponseDto> {
    const [updated] = await this.drizzleWrite.db
      .update(profiles)
      .set({
        businessVerificationStatus: verifyDto.status,
        businessVerificationDate: verifyDto.status === 'verified' ? new Date() : null,
        updatedAt: new Date()
      })
      .where(eq(profiles.id, profileId))
      .returning();

    if (!updated) {
      throw new NotFoundException('PROFILE_NOT_FOUND');
    }

    this.logger.log('BUSINESS_PROFILE_VERIFICATION_UPDATED');
    return this.toResponseDto(updated);
  }

  /**
   * Update personal profile
   */
  async updateProfile(keycloakSub: string, updateDto: UpdateProfileDto, email?: string): Promise<ProfileResponseDto> {
    const profile = await this.ensureProfile(keycloakSub, email);

    let updated: ProfileRecord;
    try {
      [updated] = await this.drizzleWrite.db
        .update(profiles)
        .set({
          firstName: updateDto.firstName ?? profile.firstName,
          lastName: updateDto.lastName ?? profile.lastName,
          username: updateDto.username ?? profile.username,
          bio: updateDto.bio ?? profile.bio,
          interests: updateDto.interests ?? profile.interests,
          isPrivate: updateDto.isPrivate !== undefined ? updateDto.isPrivate : profile.isPrivate,
          updatedAt: new Date()
        })
        .where(eq(profiles.keycloakSub, keycloakSub))
        .returning();
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('USERNAME_ALREADY_TAKEN');
      throw error;
    }

    this.logger.log('PROFILE_UPDATED');
    return this.toResponseDto(updated);
  }

  /**
   * Upload avatar
   */
  async uploadAvatar(keycloakSub: string, file: Express.Multer.File, email?: string): Promise<ProfileResponseDto> {
    const profile = await this.ensureProfile(keycloakSub, email);
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException({ code: 'FILE_SIZE_EXCEEDED', details: { maxBytes: AVATAR_MAX_BYTES } });
    }
    const image = detectAvatarImage(file.buffer);
    if (!image || image.mimeType !== file.mimetype) throw new BadRequestException('AVATAR_IMAGE_INVALID');

    const key = `profiles/${profile.id}/${randomUUID()}.${image.extension}`;
    const storagePath = `${this.objectStorage.avatarBucket}/${key}`;
    const avatarUrl = this.objectStorage.getPublicUrl(this.objectStorage.avatarBucket, key);
    await this.objectStorage.putObject(this.objectStorage.avatarBucket, key, file.buffer, {
      'Content-Type': image.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable'
    });

    let updated: ProfileRecord;
    try {
      [updated] = await this.drizzleWrite.db
        .update(profiles)
        .set({ avatarUrl, avatarStoragePath: storagePath, updatedAt: new Date() })
        .where(eq(profiles.keycloakSub, keycloakSub))
        .returning();
    } catch (error) {
      await this.removeAvatar(storagePath);
      throw error;
    }

    if (profile.avatarStoragePath) await this.removeAvatar(profile.avatarStoragePath);

    this.logger.log('PROFILE_AVATAR_UPLOADED');
    return this.toResponseDto(updated);
  }

  /**
   * Delete avatar
   */
  async deleteAvatar(keycloakSub: string, email?: string): Promise<ProfileResponseDto> {
    const profile = await this.ensureProfile(keycloakSub, email);

    const [updated] = await this.drizzleWrite.db
      .update(profiles)
      .set({
        avatarUrl: null,
        avatarStoragePath: null,
        updatedAt: new Date()
      })
      .where(eq(profiles.keycloakSub, keycloakSub))
      .returning();

    if (profile.avatarStoragePath) await this.removeAvatar(profile.avatarStoragePath);

    this.logger.log('PROFILE_AVATAR_DELETED');
    return this.toResponseDto(updated);
  }

  /**
   * Create business profile
   * Converts personal profile to business or creates new business profile
   */
  private async createBusinessProfile(
    keycloakSub: string,
    createDto: CreateBusinessProfileDto
  ): Promise<ProfileResponseDto> {
    // Check if NIP already exists
    const existingBusiness = await this.drizzleRead.db
      .select()
      .from(profiles)
      .where(eq(profiles.nip, createDto.nip))
      .limit(1);

    if (existingBusiness.length > 0) {
      throw new ConflictException('BUSINESS_NIP_ALREADY_REGISTERED');
    }

    const profile = await this.getProfileBySub(keycloakSub);

    // Update profile to business type
    const [updated] = await this.drizzleWrite.db
      .update(profiles)
      .set({
        accountType: 'business',
        businessName: createDto.businessName,
        nip: createDto.nip,
        businessDescription: createDto.businessDescription,
        websiteUrl: createDto.websiteUrl,
        firstName: createDto.firstName ?? profile.firstName,
        lastName: createDto.lastName ?? profile.lastName,
        businessVerificationStatus: 'pending',
        updatedAt: new Date()
      })
      .where(eq(profiles.keycloakSub, keycloakSub))
      .returning();

    this.logger.log('BUSINESS_PROFILE_CREATED');
    return this.toResponseDto(updated);
  }

  /**
   * Update business profile
   */
  private async updateBusinessProfile(
    keycloakSub: string,
    updateDto: UpdateBusinessProfileDto
  ): Promise<ProfileResponseDto> {
    const profile = await this.getProfileBySub(keycloakSub);

    if (profile.accountType !== 'business') {
      throw new BadRequestException('BUSINESS_ACCOUNT_REQUIRED');
    }

    // Check if NIP is being changed and already exists
    if (updateDto.nip && updateDto.nip !== profile.nip) {
      const existingBusiness = await this.drizzleRead.db
        .select()
        .from(profiles)
        .where(eq(profiles.nip, updateDto.nip))
        .limit(1);

      if (existingBusiness.length > 0) {
        throw new ConflictException('BUSINESS_NIP_ALREADY_REGISTERED');
      }
    }

    const [updated] = await this.drizzleWrite.db
      .update(profiles)
      .set({
        businessName: updateDto.businessName ?? profile.businessName,
        nip: updateDto.nip ?? profile.nip,
        businessDescription: updateDto.businessDescription ?? profile.businessDescription,
        websiteUrl: updateDto.websiteUrl ?? profile.websiteUrl,
        firstName: updateDto.firstName ?? profile.firstName,
        lastName: updateDto.lastName ?? profile.lastName,
        isPrivate: updateDto.isPrivate !== undefined ? updateDto.isPrivate : profile.isPrivate,
        updatedAt: new Date()
      })
      .where(eq(profiles.keycloakSub, keycloakSub))
      .returning();

    this.logger.log('BUSINESS_PROFILE_UPDATED');
    return this.toResponseDto(updated);
  }

  /**
   * Request phone verification (sends SMS code)
   */
  async requestPhoneVerification(
    keycloakSub: string,
    requestDto: RequestPhoneVerificationDto,
    email?: string
  ): Promise<{ status: 'PHONE_VERIFICATION_CODE_SENT'; expiresInSeconds: number }> {
    const profile = await this.ensureProfile(keycloakSub, email);
    const now = new Date();

    if (
      profile.phoneVerificationSentAt &&
      now.getTime() - profile.phoneVerificationSentAt.getTime() < PHONE_VERIFICATION_COOLDOWN_MS
    ) {
      const retryAfterSeconds = Math.ceil(
        (PHONE_VERIFICATION_COOLDOWN_MS - (now.getTime() - profile.phoneVerificationSentAt.getTime())) / 1000
      );
      throw new HttpException(
        {
          code: 'PHONE_VERIFICATION_COOLDOWN_ACTIVE',
          details: { retryAfterSeconds }
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Check if phone already verified for another account
    const existingPhone = await this.drizzleRead.db
      .select()
      .from(profiles)
      .where(and(eq(profiles.phoneNumber, requestDto.phoneNumber), eq(profiles.isPhoneVerified, true)))
      .limit(1);

    if (existingPhone.length > 0) {
      throw new ConflictException('PHONE_NUMBER_ALREADY_VERIFIED');
    }

    const verificationCode = generatePhoneVerificationCode();
    const verificationHash = hashPhoneVerificationCode(verificationCode, this.phoneVerificationSecret());
    const expiresAt = new Date(now.getTime() + PHONE_VERIFICATION_CODE_TTL_MS);

    if (!profile.email) {
      throw new BadRequestException('PHONE_VERIFICATION_DELIVERY_ADDRESS_MISSING');
    }

    await this.drizzleWrite.db
      .update(profiles)
      .set({
        phoneNumber: requestDto.phoneNumber,
        isPhoneVerified: false,
        phoneVerificationToken: verificationHash,
        phoneVerificationExpiresAt: expiresAt,
        phoneVerificationSentAt: now,
        phoneVerificationAttempts: 0,
        updatedAt: new Date()
      })
      .where(eq(profiles.keycloakSub, keycloakSub));

    try {
      await this.phoneVerificationDelivery.send({
        phoneNumber: requestDto.phoneNumber,
        recipientEmail: profile.email,
        verificationCode,
        expiresInSeconds: PHONE_VERIFICATION_CODE_TTL_MS / 1000
      });
    } catch (error) {
      await this.clearPhoneVerification(keycloakSub);
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('PHONE_VERIFICATION_DELIVERY_FAILED');
    }

    this.logger.log('PHONE_VERIFICATION_REQUESTED');
    return {
      status: 'PHONE_VERIFICATION_CODE_SENT',
      expiresInSeconds: PHONE_VERIFICATION_CODE_TTL_MS / 1000
    };
  }

  /**
   * Verify phone number
   */
  async verifyPhone(keycloakSub: string, verifyDto: VerifyPhoneDto, email?: string): Promise<ProfileResponseDto> {
    const profile = await this.ensureProfile(keycloakSub, email);

    if (!profile.phoneVerificationToken) {
      throw new BadRequestException('PHONE_VERIFICATION_NOT_REQUESTED');
    }

    if (!profile.phoneVerificationExpiresAt || profile.phoneVerificationExpiresAt.getTime() <= Date.now()) {
      await this.clearPhoneVerification(keycloakSub);
      throw new BadRequestException('PHONE_VERIFICATION_CODE_EXPIRED');
    }

    if (profile.phoneVerificationAttempts >= PHONE_VERIFICATION_MAX_ATTEMPTS) {
      throw new HttpException('PHONE_VERIFICATION_ATTEMPTS_EXCEEDED', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (
      !isPhoneVerificationCodeValid(
        verifyDto.verificationCode,
        profile.phoneVerificationToken,
        this.phoneVerificationSecret()
      )
    ) {
      const [attemptState] = await this.drizzleWrite.db
        .update(profiles)
        .set({
          phoneVerificationAttempts: sql`${profiles.phoneVerificationAttempts} + 1`,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(profiles.keycloakSub, keycloakSub),
            eq(profiles.phoneVerificationToken, profile.phoneVerificationToken),
            lt(profiles.phoneVerificationAttempts, PHONE_VERIFICATION_MAX_ATTEMPTS)
          )
        )
        .returning({ attempts: profiles.phoneVerificationAttempts });

      if (!attemptState) {
        throw new ConflictException('PHONE_VERIFICATION_STATE_CHANGED');
      }

      if (attemptState.attempts >= PHONE_VERIFICATION_MAX_ATTEMPTS) {
        throw new HttpException('PHONE_VERIFICATION_ATTEMPTS_EXCEEDED', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new BadRequestException('PHONE_VERIFICATION_CODE_INVALID');
    }

    const [updated] = await this.drizzleWrite.db
      .update(profiles)
      .set({
        isPhoneVerified: true,
        phoneVerificationToken: null,
        phoneVerificationExpiresAt: null,
        phoneVerificationSentAt: null,
        phoneVerificationAttempts: 0,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(profiles.keycloakSub, keycloakSub),
          eq(profiles.phoneVerificationToken, profile.phoneVerificationToken),
          lt(profiles.phoneVerificationAttempts, PHONE_VERIFICATION_MAX_ATTEMPTS)
        )
      )
      .returning();

    if (!updated) {
      throw new ConflictException('PHONE_VERIFICATION_STATE_CHANGED');
    }

    this.logger.log('PHONE_VERIFIED');
    return this.toResponseDto(updated);
  }

  private async clearPhoneVerification(keycloakSub: string): Promise<void> {
    await this.drizzleWrite.db
      .update(profiles)
      .set({
        phoneVerificationToken: null,
        phoneVerificationExpiresAt: null,
        phoneVerificationSentAt: null,
        phoneVerificationAttempts: 0,
        updatedAt: new Date()
      })
      .where(eq(profiles.keycloakSub, keycloakSub));
  }

  private phoneVerificationSecret(): string {
    const secret = this.config.get<string>('PHONE_VERIFICATION_HASH_SECRET');
    if (secret) {
      return secret;
    }
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException('PHONE_VERIFICATION_NOT_CONFIGURED');
    }
    return 'bezoom-development-phone-verification-secret';
  }

  private async removeAvatar(storagePath: string): Promise<void> {
    const [bucket, ...keyParts] = storagePath.split('/');
    const key = keyParts.join('/');
    if (bucket !== this.objectStorage.avatarBucket || !key) return;
    try {
      await this.objectStorage.removeObject(bucket, key);
    } catch {
      this.logger.warn('PROFILE_AVATAR_CLEANUP_FAILED');
    }
  }

  /**
   * Convert database entity to response DTO
   */
  private toResponseDto(profile: ProfileRecord): ProfileResponseDto {
    return {
      id: profile.id,
      accountType: 'personal',
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      username: profile.username ?? undefined,
      email: profile.email ?? undefined,
      bio: profile.bio ?? undefined,
      avatarUrl: profile.avatarUrl ?? undefined,
      interests: profile.interests ?? undefined,
      isPhoneVerified: profile.isPhoneVerified,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      isPrivate: profile.isPrivate,
      onboardingCompleted: Boolean(profile.username),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
  }

  private toPublicResponseDto(profile: ProfileRecord): PublicProfileResponseDto {
    const common = {
      id: profile.id,
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      username: profile.username ?? undefined,
      avatarUrl: profile.avatarUrl ?? undefined,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      isPrivate: profile.isPrivate,
      createdAt: profile.createdAt
    };

    return profile.isPrivate
      ? common
      : {
          ...common,
          bio: profile.bio ?? undefined,
          interests: profile.interests ?? undefined
        };
  }
}
