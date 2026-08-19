import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@api/shared/infrastructure/auth';
import type { ICurrentUser } from '@api/shared/infrastructure/auth';
import { RedisRateLimit } from '@api/shared/infrastructure/rate-limit';
import { CursorQueryDto } from '@api/modules/events/application/dto/cursor-query.dto';
import { CursorFollowedProfilesDto, FollowCreatorResponseDto } from './dto/profile.dto';
import { CreatorFollowService } from './services/creator-follow.service';

@ApiTags('Creator follows')
@ApiBearerAuth('JWT-auth')
@Controller('user/follows')
export class CreatorFollowsController {
  constructor(private readonly follows: CreatorFollowService) {}

  @ApiOperation({ summary: 'List creators followed by the current user' })
  @ApiResponse({ status: 200, type: CursorFollowedProfilesDto })
  @Get('following')
  listFollowing(@CurrentUser() user: ICurrentUser, @Query() query: CursorQueryDto) {
    return this.follows.listFollowing(user.id, query.cursor, query.limit ?? 20);
  }

  @ApiOperation({ summary: 'List followers of the current creator profile' })
  @ApiResponse({ status: 200, type: CursorFollowedProfilesDto })
  @Get('followers')
  listFollowers(@CurrentUser() user: ICurrentUser, @Query() query: CursorQueryDto) {
    return this.follows.listFollowers(user.id, query.cursor, query.limit ?? 20);
  }

  @ApiOperation({ summary: 'Follow a creator by public profile id' })
  @ApiResponse({ status: 200, type: FollowCreatorResponseDto })
  @HttpCode(HttpStatus.OK)
  @Put(':profileId')
  @RedisRateLimit({ name: 'creator_follow_user', limit: 60, windowSeconds: 60, scopes: ['user'] })
  follow(@CurrentUser() user: ICurrentUser, @Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.follows.follow(user.id, profileId);
  }

  @ApiOperation({ summary: 'Stop following a creator' })
  @ApiResponse({ status: 200, type: FollowCreatorResponseDto })
  @HttpCode(HttpStatus.OK)
  @Delete(':profileId')
  unfollow(@CurrentUser() user: ICurrentUser, @Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.follows.unfollow(user.id, profileId);
  }
}
