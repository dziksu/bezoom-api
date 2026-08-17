import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@api/shared/infrastructure/auth';
import type { ICurrentUser } from '@api/shared/infrastructure/auth';
import { UpdateUserSettingsDto, UserSettingsResponseDto } from './dto/user-settings.dto';
import { UserSettingsService } from './services/user-settings.service';

@ApiTags('Account settings')
@ApiBearerAuth('JWT-auth')
@Controller('user/settings')
export class UserSettingsController {
  constructor(private readonly settings: UserSettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get the authenticated user's account settings" })
  @ApiResponse({ status: 200, type: UserSettingsResponseDto })
  getSettings(@CurrentUser() user: ICurrentUser): Promise<UserSettingsResponseDto> {
    return this.settings.getSettings(
      user.id,
      user.email,
      user.firstName,
      user.lastName,
      user.issuedAt,
      user.emailVerified
    );
  }

  @Patch()
  @ApiOperation({
    summary: "Partially update the authenticated user's account settings",
    description: 'Only supplied fields are changed; omitted settings retain their current values.'
  })
  @ApiResponse({ status: 200, type: UserSettingsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid settings' })
  updateSettings(
    @CurrentUser() user: ICurrentUser,
    @Body() update: UpdateUserSettingsDto
  ): Promise<UserSettingsResponseDto> {
    return this.settings.updateSettings(
      user.id,
      update,
      user.email,
      user.firstName,
      user.lastName,
      user.issuedAt,
      user.emailVerified
    );
  }
}
