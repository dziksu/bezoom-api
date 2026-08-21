import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicEventActorDto {
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
}

export class CursorEventActorsDto {
  @ApiProperty({ type: [PublicEventActorDto] })
  items: PublicEventActorDto[];

  @ApiProperty()
  hasMore: boolean;

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class EventCommentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  eventId: string;

  @ApiPropertyOptional()
  parentId?: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ type: PublicEventActorDto })
  author: PublicEventActorDto;

  @ApiPropertyOptional({ enum: ['ORGANIZER', 'SUBMITTER'] })
  authorRole?: 'ORGANIZER' | 'SUBMITTER';

  @ApiProperty({ type: [PublicEventActorDto] })
  mentions: PublicEventActorDto[];

  @ApiProperty()
  likesCount: number;

  @ApiProperty()
  likedByViewer: boolean;

  @ApiPropertyOptional({ type: PublicEventActorDto })
  organizerLike?: PublicEventActorDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  isEdited: boolean;
}

export class CommentLikeResponseDto {
  @ApiProperty()
  liked: boolean;

  @ApiProperty()
  likesCount: number;

  @ApiPropertyOptional({ type: PublicEventActorDto })
  organizerLike?: PublicEventActorDto;
}

export class CommentMentionSuggestionsDto {
  @ApiProperty({ type: [PublicEventActorDto] })
  items: PublicEventActorDto[];
}

export class CommentMentionSuggestionsQueryDto {
  @ApiPropertyOptional({ maxLength: 20 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/^@/, '') : value))
  @IsOptional()
  @IsString()
  @MaxLength(20)
  query?: string;

  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 10 })
  @Transform(({ value }: { value: unknown }) => (value === undefined ? 8 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 8;
}

export class CursorEventCommentsDto {
  @ApiProperty({ type: [EventCommentDto] })
  items: EventCommentDto[];

  @ApiProperty()
  hasMore: boolean;

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class CreateEventCommentDto {
  @ApiProperty({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Top-level comment being replied to.' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}

export class UpdateEventCommentDto {
  @ApiProperty({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body: string;
}
