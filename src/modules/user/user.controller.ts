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
  BadRequestException,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthenticatedUser } from 'nest-keycloak-connect';
import type { Express } from 'express';
import { ProfileService } from './services/profile.service';
import {
  UpdateProfileDto,
  CreateBusinessProfileDto,
  UpdateBusinessProfileDto,
  RequestPhoneVerificationDto,
  VerifyPhoneDto,
  ProfileResponseDto
} from './dto/profile.dto';

@ApiTags('User Profile')
@ApiBearerAuth()
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
  async getProfile(@AuthenticatedUser() user: { sub: string; email: string }) {
    return this.profileService.getMyProfile(user.sub);
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
    type: ProfileResponseDto
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @Get('profile/:id')
  async getProfileById(@Param('id') profileId: string) {
    return this.profileService.getProfileById(profileId);
  }

  /**
   * Update profile
   */
  @ApiOperation({
    summary: 'Update user profile',
    description: 'Update personal profile information (name, bio, interests, etc.)'
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: ProfileResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @Patch('profile')
  async updateProfile(@AuthenticatedUser() user: { sub: string }, @Body() updateDto: UpdateProfileDto) {
    return this.profileService.updateProfile(user.sub, updateDto);
  }

  /**
   * Upload avatar
   */
  @ApiOperation({
    summary: 'Upload user avatar',
    description: 'Upload a profile avatar image (JPEG, PNG, WebP, GIF - max 5MB)'
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
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@AuthenticatedUser() user: { sub: string }, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.profileService.uploadAvatar(user.sub, file);
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
  async deleteAvatar(@AuthenticatedUser() user: { sub: string }) {
    return this.profileService.deleteAvatar(user.sub);
  }

  /**
   * Create business profile
   */
  @ApiOperation({
    summary: 'Create business profile',
    description: 'Convert personal profile to business or create new business profile'
  })
  @ApiResponse({
    status: 201,
    description: 'Business profile created successfully',
    type: ProfileResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Business already registered' })
  @HttpCode(HttpStatus.CREATED)
  @Post('profile/business')
  async createBusinessProfile(@AuthenticatedUser() user: { sub: string }, @Body() createDto: CreateBusinessProfileDto) {
    return this.profileService.createBusinessProfile(user.sub, createDto);
  }

  /**
   * Update business profile
   */
  @ApiOperation({
    summary: 'Update business profile',
    description: 'Update business profile information (name, NIP, description, etc.)'
  })
  @ApiResponse({
    status: 200,
    description: 'Business profile updated successfully',
    type: ProfileResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid input or not a business account' })
  @Patch('profile/business')
  async updateBusinessProfile(@AuthenticatedUser() user: { sub: string }, @Body() updateDto: UpdateBusinessProfileDto) {
    return this.profileService.updateBusinessProfile(user.sub, updateDto);
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
  async requestPhoneVerification(
    @AuthenticatedUser() user: { sub: string },
    @Body() requestDto: RequestPhoneVerificationDto
  ) {
    return this.profileService.requestPhoneVerification(user.sub, requestDto);
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
  async verifyPhone(@AuthenticatedUser() user: { sub: string }, @Body() verifyDto: VerifyPhoneDto) {
    return this.profileService.verifyPhone(user.sub, verifyDto);
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
  async getProfileInfo(@AuthenticatedUser() user: { sub: string; email: string; preferred_username: string }) {
    return {
      message: `Welcome, ${user.preferred_username}!`,
      userId: user.sub,
      email: user.email
    };
  }
}
