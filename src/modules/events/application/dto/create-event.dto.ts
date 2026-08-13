import {
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsLatitude,
  IsLongitude,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsUUID,
  IsNumber,
  Min,
  IsUrl,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EVENT_CATEGORIES, type EventCategory, type EventVisibility } from '../../domain/event.aggregate';
import type { PriceType } from '../../domain/value-objects/price.vo';

const PRICE_TYPES: PriceType[] = ['FREE', 'FIXED', 'RANGE', 'DONATION'];
const VISIBILITIES: EventVisibility[] = ['PUBLIC', 'PRIVATE'];

@ValidatorConstraint({ name: 'IsFutureDate', async: false })
class IsFutureDateConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
  }

  defaultMessage(): string {
    return 'EVENT_START_DATE_NOT_FUTURE';
  }
}

export class LocationDto {
  @ApiProperty({ example: 50.0647 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 19.945 })
  @IsLongitude()
  longitude: number;

  @ApiProperty({ example: 'Rynek Główny 1', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiProperty({ example: 'Kraków', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ example: 'PL', required: false, default: 'PL' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}

export class CreateEventDto {
  @ApiProperty({ example: 'Summer Jazz Night' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'Join us for an evening of live jazz music in the heart of the old town...' })
  @IsString()
  @MinLength(50)
  description: string;

  @ApiProperty({ enum: EVENT_CATEGORIES, example: 'MUSIC_AND_NIGHTLIFE' })
  @IsEnum(EVENT_CATEGORIES)
  category: EventCategory;

  @ApiProperty({ example: '2026-08-15T19:00:00+02:00' })
  @IsISO8601()
  @Validate(IsFutureDateConstraint)
  startDate: string;

  @ApiProperty({ example: '2026-08-15T23:00:00+02:00', required: false })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiProperty({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @ApiProperty({ enum: PRICE_TYPES, example: 'FREE' })
  @IsEnum(PRICE_TYPES)
  priceType: PriceType;

  @ApiProperty({ required: false, example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @ApiProperty({ required: false, example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @ApiProperty({ required: false, default: 'PLN' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  ticketUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  priceNotes?: string;

  @ApiProperty({ required: false, example: ['wheelchair-accessible', 'parking-available'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  amenities?: string[];

  @ApiProperty({ enum: VISIBILITIES, required: false, default: 'PUBLIC' })
  @IsOptional()
  @IsEnum(VISIBILITIES)
  visibility?: EventVisibility;

  @ApiProperty({
    type: [String],
    description: 'Photo ids returned by POST /events/photos/upload-urls, after the client has uploaded to each URL',
    minItems: 1,
    maxItems: 5
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  photoIds: string[];
}
