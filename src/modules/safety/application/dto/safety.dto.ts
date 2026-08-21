import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  moderationReportReasons,
  moderationReportStatuses,
  type ModerationReportReason,
  type ModerationReportStatus
} from '@api/shared/infrastructure/database/schema/moderation-reports';

export class ReportEventDto {
  @ApiProperty({ enum: moderationReportReasons })
  @IsEnum(moderationReportReasons)
  reason: ModerationReportReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;
}

export class EventReportResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  eventId: string;

  @ApiProperty({ enum: moderationReportReasons })
  reason: ModerationReportReason;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: moderationReportStatuses, example: 'PENDING' })
  status: ModerationReportStatus;

  @ApiProperty()
  createdAt: Date;
}

export class BlockedProfileDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiProperty()
  blockedAt: Date;
}

export class UserBlockResponseDto {
  @ApiProperty()
  profileId: string;

  @ApiProperty()
  blocked: boolean;
}

export class CursorBlockedProfilesDto {
  @ApiProperty({ type: [BlockedProfileDto] })
  items: BlockedProfileDto[];

  @ApiProperty()
  hasMore: boolean;

  @ApiPropertyOptional()
  nextCursor?: string;
}
