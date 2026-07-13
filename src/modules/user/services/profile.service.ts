import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { DrizzleReadService } from '@api/shared/infrastructure/drizzle-read.service';
import { profiles } from '@api/shared/infrastructure/database/schema/profiles';
import { FileStorageService } from '@api/shared/infrastructure/storage/file-storage.service';
import {
  UpdateProfileDto,
  CreateBusinessProfileDto,
  UpdateBusinessProfileDto,
  RequestPhoneVerificationDto,
  VerifyPhoneDto,
  VerifyBusinessDto,
  ProfileResponseDto
} from '../dto/profile.dto';

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
    private readonly fileStorage: FileStorageService
  ) {}

  /**
   * Get profile by Keycloak sub
   * Used internally and for response mapping
   */
  async getProfileBySub(keycloakSub: string): Promise<any> {
    const result = await this.drizzleRead.db
      .select()
      .from(profiles)
      .where(eq(profiles.keycloakSub, keycloakSub))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('Profile not found');
    }

    return result[0];
  }

  /**
   * Get profile by ID (public lookup)
   */
  async getProfileById(profileId: string): Promise<ProfileResponseDto> {
    const result = await this.drizzleRead.db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);

    if (result.length === 0) {
      throw new NotFoundException('Profile not found');
    }

    const profile = result[0];

    // Don't expose private information for private accounts
    if (profile.isPrivate) {
      return this.stripSensitiveData(profile);
    }

    return this.toResponseDto(profile);
  }

  /**
   * Get authenticated user's profile
   */
  async getMyProfile(keycloakSub: string, email?: string): Promise<ProfileResponseDto> {
    try {
      const profile = await this.getProfileBySub(keycloakSub);
      return this.toResponseDto(profile);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return this.createProfile(keycloakSub, email ?? '');
      }
      throw error;
    }
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
    try {
      const [newProfile] = await this.drizzleWrite.db
        .insert(profiles)
        .values({
          keycloakSub,
          email,
          firstName,
          lastName,
          accountType: 'personal'
        })
        .returning();

      this.logger.log(`Profile created for user: ${keycloakSub}`);
      return this.toResponseDto(newProfile);
    } catch (error) {
      if ((error as Error).message.includes('unique')) {
        throw new ConflictException('Profile already exists for this user');
      }
      throw error;
    }
  }

  /**
   * Verify or reject a business profile.
   */
  async verifyBusinessProfile(profileId: string, verifyDto: VerifyBusinessDto): Promise<ProfileResponseDto> {
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
      throw new NotFoundException('Profile not found');
    }

    this.logger.log(`Business profile ${verifyDto.status}: ${profileId}`);
    return this.toResponseDto(updated);
  }

  /**
   * Update personal profile
   */
  async updateProfile(keycloakSub: string, updateDto: UpdateProfileDto): Promise<ProfileResponseDto> {
    const profile = await this.getProfileBySub(keycloakSub);

    // Check if trying to update username - verify uniqueness
    if (updateDto.username && updateDto.username !== profile.username) {
      const existingUsername = await this.drizzleRead.db
        .select()
        .from(profiles)
        .where(eq(profiles.username, updateDto.username))
        .limit(1);

      if (existingUsername.length > 0) {
        throw new ConflictException('Username already taken');
      }
    }

    const [updated] = await this.drizzleWrite.db
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

    this.logger.log(`Profile updated for user: ${keycloakSub}`);
    return this.toResponseDto(updated);
  }

  /**
   * Upload avatar
   */
  async uploadAvatar(keycloakSub: string, file: Express.Multer.File): Promise<ProfileResponseDto> {
    const profile = await this.getProfileBySub(keycloakSub);

    // Delete old avatar if exists
    if (profile.avatarStoragePath) {
      await this.fileStorage.deleteFile(profile.avatarStoragePath);
    }

    // Upload new avatar
    const uploadResult = await this.fileStorage.uploadFile(file, 'avatars');

    // Update profile
    const [updated] = await this.drizzleWrite.db
      .update(profiles)
      .set({
        avatarUrl: uploadResult.url,
        avatarStoragePath: uploadResult.storagePath,
        updatedAt: new Date()
      })
      .where(eq(profiles.keycloakSub, keycloakSub))
      .returning();

    this.logger.log(`Avatar uploaded for user: ${keycloakSub}`);
    return this.toResponseDto(updated);
  }

  /**
   * Delete avatar
   */
  async deleteAvatar(keycloakSub: string): Promise<ProfileResponseDto> {
    const profile = await this.getProfileBySub(keycloakSub);

    if (profile.avatarStoragePath) {
      await this.fileStorage.deleteFile(profile.avatarStoragePath);
    }

    const [updated] = await this.drizzleWrite.db
      .update(profiles)
      .set({
        avatarUrl: null,
        avatarStoragePath: null,
        updatedAt: new Date()
      })
      .where(eq(profiles.keycloakSub, keycloakSub))
      .returning();

    this.logger.log(`Avatar deleted for user: ${keycloakSub}`);
    return this.toResponseDto(updated);
  }

  /**
   * Create business profile
   * Converts personal profile to business or creates new business profile
   */
  async createBusinessProfile(keycloakSub: string, createDto: CreateBusinessProfileDto): Promise<ProfileResponseDto> {
    // Check if NIP already exists
    const existingBusiness = await this.drizzleRead.db
      .select()
      .from(profiles)
      .where(eq(profiles.nip, createDto.nip))
      .limit(1);

    if (existingBusiness.length > 0) {
      throw new ConflictException('Business with this NIP already registered');
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

    this.logger.log(`Business profile created for user: ${keycloakSub}`);
    return this.toResponseDto(updated);
  }

  /**
   * Update business profile
   */
  async updateBusinessProfile(keycloakSub: string, updateDto: UpdateBusinessProfileDto): Promise<ProfileResponseDto> {
    const profile = await this.getProfileBySub(keycloakSub);

    if (profile.accountType !== 'business') {
      throw new BadRequestException('Only business accounts can be updated with this method');
    }

    // Check if NIP is being changed and already exists
    if (updateDto.nip && updateDto.nip !== profile.nip) {
      const existingBusiness = await this.drizzleRead.db
        .select()
        .from(profiles)
        .where(eq(profiles.nip, updateDto.nip))
        .limit(1);

      if (existingBusiness.length > 0) {
        throw new ConflictException('Business with this NIP already registered');
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

    this.logger.log(`Business profile updated for user: ${keycloakSub}`);
    return this.toResponseDto(updated);
  }

  /**
   * Request phone verification (sends SMS code)
   */
  async requestPhoneVerification(
    keycloakSub: string,
    requestDto: RequestPhoneVerificationDto
  ): Promise<{ message: string }> {
    const profile = await this.getProfileBySub(keycloakSub);

    // Check if phone already verified for another account
    const existingPhone = await this.drizzleRead.db
      .select()
      .from(profiles)
      .where(and(eq(profiles.phoneNumber, requestDto.phoneNumber), eq(profiles.isPhoneVerified, true)))
      .limit(1);

    if (existingPhone.length > 0) {
      throw new ConflictException('This phone number is already verified for another account');
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // TODO: Send SMS via service (e.g., Twilio)
    this.logger.log(`Phone verification code for ${requestDto.phoneNumber}: ${verificationCode}`);

    // Store token (in real app, would be hashed and stored with expiration)
    await this.drizzleWrite.db
      .update(profiles)
      .set({
        phoneNumber: requestDto.phoneNumber,
        phoneVerificationToken: verificationCode, // In production: hash this!
        updatedAt: new Date()
      })
      .where(eq(profiles.keycloakSub, keycloakSub));

    return { message: 'Verification code sent' };
  }

  /**
   * Verify phone number
   */
  async verifyPhone(keycloakSub: string, verifyDto: VerifyPhoneDto): Promise<ProfileResponseDto> {
    const profile = await this.getProfileBySub(keycloakSub);

    if (!profile.phoneVerificationToken) {
      throw new BadRequestException('No verification code requested');
    }

    if (profile.phoneVerificationToken !== verifyDto.verificationCode) {
      throw new BadRequestException('Invalid verification code');
    }

    const [updated] = await this.drizzleWrite.db
      .update(profiles)
      .set({
        isPhoneVerified: true,
        phoneVerificationToken: null,
        updatedAt: new Date()
      })
      .where(eq(profiles.keycloakSub, keycloakSub))
      .returning();

    this.logger.log(`Phone verified for user: ${keycloakSub}`);
    return this.toResponseDto(updated);
  }

  /**
   * Convert database entity to response DTO
   */
  private toResponseDto(profile: any): ProfileResponseDto {
    return {
      id: profile.id,
      keycloakSub: profile.keycloakSub,
      accountType: profile.accountType,
      firstName: profile.firstName,
      lastName: profile.lastName,
      username: profile.username,
      email: profile.email,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      interests: profile.interests,
      businessName: profile.businessName,
      businessDescription: profile.businessDescription,
      websiteUrl: profile.websiteUrl,
      isPhoneVerified: profile.isPhoneVerified,
      businessVerificationStatus: profile.businessVerificationStatus,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      isPrivate: profile.isPrivate,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
  }

  /**
   * Strip sensitive data for private profiles
   */
  private stripSensitiveData(profile: any): ProfileResponseDto {
    return {
      id: profile.id,
      keycloakSub: profile.keycloakSub,
      accountType: profile.accountType,
      firstName: profile.firstName,
      lastName: profile.lastName,
      // Don't expose email, bio for private accounts
      isPrivate: profile.isPrivate,
      isPhoneVerified: profile.isPhoneVerified,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
  }
}
