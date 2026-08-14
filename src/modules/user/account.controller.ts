import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AllowInactiveAccount, CurrentUser } from '@api/shared/infrastructure/auth';
import type { ICurrentUser } from '@api/shared/infrastructure/auth';
import { AccountLifecycleResponseDto } from './dto/account-lifecycle.dto';
import { AccountLifecycleService } from './services/account-lifecycle.service';

@ApiTags('Account lifecycle')
@ApiBearerAuth('JWT-auth')
@Controller('user/account')
@AllowInactiveAccount()
export class AccountController {
  constructor(private readonly accounts: AccountLifecycleService) {}

  @Get()
  @ApiOperation({
    summary: 'Get account lifecycle and identity-management entry point',
    description: 'Email, password, MFA, sessions and linked identities are managed in Keycloak Account Console.'
  })
  @ApiResponse({ status: 200, type: AccountLifecycleResponseDto })
  getStatus(@CurrentUser() user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    return this.accounts.getStatus(user);
  }

  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Temporarily deactivate my Bezoom account' })
  deactivate(@CurrentUser() user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    return this.accounts.deactivate(user);
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate my temporarily deactivated account' })
  reactivate(@CurrentUser() user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    return this.accounts.reactivate(user);
  }

  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Schedule account deletion after the configured grace period' })
  requestDeletion(@CurrentUser() user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    return this.accounts.requestDeletion(user);
  }

  @Post('deletion/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending account deletion before anonymization starts' })
  cancelDeletion(@CurrentUser() user: ICurrentUser): Promise<AccountLifecycleResponseDto> {
    return this.accounts.cancelDeletion(user);
  }
}
