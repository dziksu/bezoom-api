import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from 'nest-keycloak-connect';

@ApiTags('User')
@Controller('user')
export class UserController {
  @ApiOperation({
    summary: 'Get user profile',
    description: "Returns the authenticated user's profile information including username, email, and user ID."
  })
  @ApiResponse({ status: 200, description: 'User profile returned successfully' })
  @Get('profile')
  // @Resource('profile')
  getProfile(@AuthenticatedUser() user: { sub: string; email: string; preferred_username: string }) {
    return {
      message: `Welcome, ${user.preferred_username}!`,
      userId: user.sub,
      email: user.email
    };
  }
}
