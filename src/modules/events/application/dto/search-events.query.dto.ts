import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, Min, Max, IsOptional, IsInt, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const GEO_SEARCH_MAX_LIMIT = 50;

export class SearchEventsQueryDto {
  @ApiProperty({ example: 50.0647, description: 'Latitude of the search origin' })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 19.945, description: 'Longitude of the search origin' })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiProperty({
    required: false,
    example: 0,
    description: '0 = current week (Mon-Sun, Europe/Warsaw), 1 = next week, etc. Omit for no week filter.'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(52)
  week?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor returned as nextCursor by the previous response.' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(GEO_SEARCH_MAX_LIMIT)
  limit?: number = 20;
}
