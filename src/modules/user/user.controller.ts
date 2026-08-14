import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import type { Express } from 'express';
import { CurrentUser } from '@api/shared/infrastructure/auth';
import type { ICurrentUser } from '@api/shared/infrastructure/auth';
import { RedisRateLimit } from '@api/shared/infrastructure/rate-limit';
import { ProfileService } from './services/profile.service';
import {
  UpdateProfileDto,
  RequestPhoneVerificationDto,
  VerifyPhoneDto,
  ProfileResponseDto,
  PublicProfileResponseDto
} from './dto/profile.dto';

@ApiTags('User Profile')
@ApiBearerAuth('JWT-auth')
@Controller('user')
export class UserController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * Get authenticated user's profile
   */
  @ApiOperation({
    summary: 'Get current user profile',
    description: "Returns the authenticated user's complete profile information"
  })
  @ApiResponse({
    status: 200,
    description: 'Profile returned successfully',
    type: ProfileResponseDto
  })
  @Get('profile')
  async getProfile(@CurrentUser() user: ICurrentUser) {
    return this.profileService.getMyProfile(
      user.id,
      user.email,
      user.firstName,
      user.lastName,
      user.issuedAt,
      user.emailVerified
    );
  }

  /**
   * Get public profile by ID
   */
  @ApiOperation({
    summary: 'Get public profile by ID',
    description: 'Returns a public profile by ID (respects privacy settings)'
  })
  @ApiResponse({
    status: 200,
    description: 'Profile returned successfully',
    type: PublicProfileResponseDto
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @Get('profile/:id')
  async getProfileById(@CurrentUser() user: ICurrentUser, @Param('id') profileId: string) {
    return this.profileService.getProfileById(profileId, user.id);
  }

  /**
   * Update profile
   */
  @ApiOperation({
    summary: 'Update user profile',
    description:
      'Update Bezoom profile data (nick, bio, interests and privacy). Email, first name, last name, password, MFA and sessions are managed by Keycloak Account Console.'
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: ProfileResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @Patch('profile')
  async updateProfile(@CurrentUser() user: ICurrentUser, @Body() updateDto: UpdateProfileDto) {
    return this.profileService.updateProfile(
      user.id,
      updateDto,
      user.email,
      user.firstName,
      user.lastName,
      user.issuedAt,
      user.emailVerified
    );
  }

  /**
   * Upload avatar
   */
  @ApiOperation({
    summary: 'Upload user avatar',
    description: 'Upload an optional profile avatar image (JPEG, PNG or WebP - max 5MB)'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar uploaded successfully',
    type: ProfileResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  @Post('profile/avatar')
  @RedisRateLimit(
    { name: 'profile_avatar_user', limit: 10, windowSeconds: 3600, scopes: ['user'] },
    { name: 'profile_avatar_ip', limit: 30, windowSeconds: 3600, scopes: ['ip'] }
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 }
    })
  )
  async uploadAvatar(@CurrentUser() user: ICurrentUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('AVATAR_FILE_REQUIRED');
    }
    return this.profileService.uploadAvatar(
      user.id,
      file,
      user.email,
      user.firstName,
      user.lastName,
      user.issuedAt,
      user.emailVerified
    );
  }

  /**
   * Delete avatar
   */
  @ApiOperation({
    summary: 'Delete user avatar',
    description: "Remove the user's profile avatar"
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar deleted successfully',
    type: ProfileResponseDto
  })
  @Delete('profile/avatar')
  async deleteAvatar(@CurrentUser() user: ICurrentUser) {
    return this.profileService.deleteAvatar(
      user.id,
      user.email,
      user.firstName,
      user.lastName,
      user.issuedAt,
      user.emailVerified
    );
  }

  /**
   * Request phone verification
   */
  @ApiOperation({
    summary: 'Request phone verification',
    description: 'Request a verification code to be sent via SMS'
  })
  @ApiResponse({
    status: 200,
    description: 'Verification code sent successfully'
  })
  @ApiResponse({ status: 400, description: 'Invalid phone number' })
  @Post('profile/phone/request-verification')
  @RedisRateLimit(
    { name: 'phone_otp_request_user', limit: 5, windowSeconds: 3600, scopes: ['user'] },
    { name: 'phone_otp_request_ip', limit: 30, windowSeconds: 3600, scopes: ['ip'] }
  )
  async requestPhoneVerification(@CurrentUser() user: ICurrentUser, @Body() requestDto: RequestPhoneVerificationDto) {
    return this.profileService.requestPhoneVerification(
      user.id,
      requestDto,
      user.email,
      user.firstName,
      user.lastName,
      user.issuedAt,
      user.emailVerified
    );
  }

  /**
   * Verify phone number
   */
  @ApiOperation({
    summary: 'Verify phone number',
    description: 'Verify phone number with the code sent via SMS'
  })
  @ApiResponse({
    status: 200,
    description: 'Phone verified successfully',
    type: ProfileResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
  @Post('profile/phone/verify')
  @RedisRateLimit(
    { name: 'phone_otp_verify_user', limit: 10, windowSeconds: 600, scopes: ['user'] },
    { name: 'phone_otp_verify_ip', limit: 100, windowSeconds: 600, scopes: ['ip'] }
  )
  async verifyPhone(@CurrentUser() user: ICurrentUser, @Body() verifyDto: VerifyPhoneDto) {
    return this.profileService.verifyPhone(
      user.id,
      verifyDto,
      user.email,
      user.firstName,
      user.lastName,
      user.issuedAt,
      user.emailVerified
    );
  }

  /**
   * Get user profile (legacy endpoint - kept for backward compatibility)
   */
  @ApiOperation({
    summary: 'Get user profile (legacy)',
    description: "Returns the authenticated user's profile information including username, email, and user ID."
  })
  @ApiResponse({ status: 200, description: 'User profile returned successfully' })
  @Get('info')
  getProfileInfo(@CurrentUser() user: ICurrentUser) {
    return {
      userId: user.id,
      email: user.email,
      username: user.username
    };
  }
}
