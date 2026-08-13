import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
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

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  isEdited: boolean;
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
