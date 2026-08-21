import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  IsBoolean,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EVENT_CATEGORIES, type EventCategory } from '../../domain/event.aggregate';
import { PRICE_TYPES, type PriceType } from '../../domain/value-objects/price.vo';
import { LocationDto } from './create-event.dto';

export class UpdateEventDto {
  @ApiPropertyOptional({
    description: 'Whether the submitter declares that they are also the event organizer.'
  })
  @IsOptional()
  @IsBoolean()
  submittedByIsOrganizer?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(50)
  description?: string;

  @ApiPropertyOptional({ enum: EVENT_CATEGORIES })
  @IsOptional()
  @IsEnum(EVENT_CATEGORIES)
  category?: EventCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Use null to remove the end date.' })
  @IsOptional()
  @IsISO8601()
  endDate?: string | null;

  @ApiPropertyOptional({ type: LocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @ApiPropertyOptional({ enum: PRICE_TYPES })
  @IsOptional()
  @IsEnum(PRICE_TYPES)
  priceType?: PriceType;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMin?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMax?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUrl()
  ticketUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  priceNotes?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ type: [String], minItems: 1, maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  photoIds?: string[];
}
