import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsPhoneNumber,
  IsArray,
  ArrayMaxSize,
  IsUrl,
  IsNotEmpty,
  Matches,
  IsBoolean
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

/**
 * Update Personal Profile DTO
 * Allows users to update their personal profile information
 */
export class UpdateProfileDto {
  @ApiProperty({ example: 'john_doe', required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens'
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : value
  )
  username?: string;

  @ApiProperty({ example: 'I love exploring local events!', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  bio?: string;

  @ApiProperty({ example: ['music', 'sports', 'art'], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  interests?: string[];

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean()
  isPrivate?: boolean;
}

/**
 * Create Business Profile DTO
 * Used during registration or to create a business profile
 */
export class CreateBusinessProfileDto {
  @ApiProperty({ example: 'My Business Name' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  businessName: string;

  @ApiProperty({ example: '1234567890' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'NIP must be exactly 10 digits' })
  nip: string;

  @ApiProperty({ example: 'We provide amazing services!', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  businessDescription?: string;

  @ApiProperty({ example: 'https://example.com', required: false })
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @ApiProperty({ example: 'John', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;
}

/**
 * Update Business Profile DTO
 * Allows updating business profile information
 */
export class UpdateBusinessProfileDto extends PartialType(CreateBusinessProfileDto) {
  @ApiProperty({ example: false, required: false })
  @IsOptional()
  isPrivate?: boolean;
}

/**
 * Verify Business DTO
 * For admin verification of business profiles
 */
export class VerifyBusinessDto {
  @ApiProperty({ example: 'verified' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(verified|rejected)$/, {
    message: 'Status must be either "verified" or "rejected"'
  })
  status: 'verified' | 'rejected';

  @ApiProperty({ example: 'Business verified successfully', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Phone Verification DTO
 */
export class VerifyPhoneDto {
  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Verification code must be 6 digits' })
  verificationCode: string;
}

/**
 * Request Phone Verification DTO
 */
export class RequestPhoneVerificationDto {
  @ApiProperty({ example: '+48123456789' })
  @IsNotEmpty()
  @IsPhoneNumber('PL', { message: 'Invalid Polish phone number' })
  phoneNumber: string;
}

export class PhoneVerificationRequestResponseDto {
  @ApiProperty({ enum: ['PHONE_VERIFICATION_CODE_SENT'] })
  status: 'PHONE_VERIFICATION_CODE_SENT';

  @ApiProperty({ description: 'Number of seconds before the verification code expires.' })
  expiresInSeconds: number;
}

export class LegacyProfileInfoResponseDto {
  @ApiProperty()
  userId: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  username?: string;
}

/**
 * Profile Response DTO
 * Returned from endpoints
 */
export class ProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['personal', 'business'] })
  accountType: 'personal' | 'business';

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  bio?: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  interests?: string[];

  @ApiProperty()
  isPhoneVerified: boolean;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty()
  isPrivate: boolean;

  @ApiProperty({ description: 'True after the user has chosen a unique public username.' })
  onboardingCompleted: boolean;

  @ApiProperty({ enum: ['ACTIVE', 'DEACTIVATED', 'PENDING_DELETION', 'ANONYMIZED'] })
  accountStatus: 'ACTIVE' | 'DEACTIVATED' | 'PENDING_DELETION' | 'ANONYMIZED';

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/** Public projection: never exposes IdP identifiers, email or phone-verification state. */
export class PublicProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['personal', 'business'] })
  accountType: 'personal' | 'business';

  @ApiProperty()
  displayName: string;

  @ApiProperty({ required: false })
  firstName?: string;

  @ApiProperty({ required: false })
  lastName?: string;

  @ApiProperty({ required: false })
  username?: string;

  @ApiProperty({ required: false })
  bio?: string;

  @ApiProperty({ required: false })
  avatarUrl?: string;

  @ApiProperty({ required: false, type: [String] })
  interests?: string[];

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty()
  isPrivate: boolean;

  @ApiProperty({ description: 'True when the profile has submitted at least one event and may be followed.' })
  isCreator: boolean;

  @ApiProperty({ description: 'True when the authenticated viewer follows this creator.' })
  isFollowedByMe: boolean;

  @ApiProperty()
  isMe: boolean;

  @ApiProperty({ description: 'Whether the viewer may see this profile attendance history.' })
  canViewAttendance: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class FollowedProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['personal', 'business'] })
  accountType: 'personal' | 'business';

  @ApiProperty()
  displayName: string;

  @ApiProperty({ required: false })
  username?: string;

  @ApiProperty({ required: false })
  avatarUrl?: string;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  isCreator: boolean;

  @ApiProperty()
  followedAt: Date;
}

export class CursorFollowedProfilesDto {
  @ApiProperty({ type: [FollowedProfileDto] })
  items: FollowedProfileDto[];

  @ApiProperty()
  hasMore: boolean;

  @ApiProperty({ required: false })
  nextCursor?: string;
}

export class FollowCreatorResponseDto {
  @ApiProperty()
  profileId: string;

  @ApiProperty()
  isFollowing: boolean;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;
}
