import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@api/shared/infrastructure/auth';
import type { ICurrentUser } from '@api/shared/infrastructure/auth';
import { RedisRateLimit } from '@api/shared/infrastructure/rate-limit';
import { CursorQueryDto } from '../../events/application/dto/cursor-query.dto';
import { BlockUserCommand } from '../application/commands/block-user/block-user.command';
import { UnblockUserCommand } from '../application/commands/unblock-user/unblock-user.command';
import { CursorBlockedProfilesDto, UserBlockResponseDto } from '../application/dto/safety.dto';
import { ListBlockedUsersQuery } from '../application/queries/list-blocked-users/list-blocked-users.query';

@ApiTags('Safety')
@ApiBearerAuth('JWT-auth')
@Controller('user/blocks')
export class UserBlocksController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  @ApiOperation({ summary: 'Block a user by public profile id' })
  @ApiResponse({ status: 200, type: UserBlockResponseDto })
  @HttpCode(HttpStatus.OK)
  @Put(':profileId')
  @RedisRateLimit({ name: 'user_block_user', limit: 30, windowSeconds: 60, scopes: ['user'] })
  block(
    @CurrentUser() user: ICurrentUser,
    @Param('profileId', ParseUUIDPipe) profileId: string
  ): Promise<UserBlockResponseDto> {
    return this.commandBus.execute(new BlockUserCommand(user.id, profileId));
  }

  @ApiOperation({ summary: 'Unblock a user' })
  @ApiResponse({ status: 204 })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':profileId')
  unblock(@CurrentUser() user: ICurrentUser, @Param('profileId', ParseUUIDPipe) profileId: string): Promise<void> {
    return this.commandBus.execute(new UnblockUserCommand(user.id, profileId));
  }

  @ApiOperation({ summary: 'Load the next blocked-users batch' })
  @ApiResponse({ status: 200, type: CursorBlockedProfilesDto })
  @Get()
  list(@CurrentUser() user: ICurrentUser, @Query() query: CursorQueryDto): Promise<CursorBlockedProfilesDto> {
    return this.queryBus.execute(new ListBlockedUsersQuery(user.id, query.cursor, query.limit ?? 20));
  }
}
