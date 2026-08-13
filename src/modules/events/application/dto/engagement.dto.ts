import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RSVP_STATUSES, type RsvpStatus } from '../../domain/engagement/rsvp-status';

export class SetRsvpDto {
  @ApiProperty({ enum: RSVP_STATUSES, example: 'CONFIRMED' })
  @IsIn(RSVP_STATUSES)
  status: RsvpStatus;
}

export class LikeResponseDto {
  @ApiProperty()
  liked: boolean;

  @ApiProperty()
  likesCount: number;
}

export class SaveResponseDto {
  @ApiProperty()
  saved: boolean;
}

export class RsvpResponseDto {
  @ApiProperty({ enum: RSVP_STATUSES, nullable: true, description: 'Null when the RSVP was cancelled' })
  status: RsvpStatus | null;

  @ApiProperty({ description: 'Number of CONFIRMED participants' })
  attendingCount: number;
}
