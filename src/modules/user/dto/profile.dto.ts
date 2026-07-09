import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  IsPhoneNumber,
  IsArray,
  ArrayMaxSize,
  IsUrl,
  IsNotEmpty,
  Matches
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

/**
 * Update Personal Profile DTO
 * Allows users to update their personal profile information
 */
export class UpdateProfileDto {
  @ApiProperty({ example: 'John', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({ example: 'john_doe', required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens'
  })
  username?: string;

  @ApiProperty({ example: 'I love exploring local events!', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
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

/**
 * Profile Response DTO
 * Returned from endpoints
 */
export class ProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  keycloakSub: string;

  @ApiProperty()
  accountType: 'personal' | 'business';

  @ApiProperty()
  firstName?: string;

  @ApiProperty()
  lastName?: string;

  @ApiProperty()
  username?: string;

  @ApiProperty()
  email?: string;

  @ApiProperty()
  bio?: string;

  @ApiProperty()
  avatarUrl?: string;

  @ApiProperty()
  interests?: string[];

  @ApiProperty()
  businessName?: string;

  @ApiProperty()
  businessDescription?: string;

  @ApiProperty()
  websiteUrl?: string;

  @ApiProperty()
  isPhoneVerified: boolean;

  @ApiProperty()
  businessVerificationStatus?: string;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty()
  isPrivate: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
