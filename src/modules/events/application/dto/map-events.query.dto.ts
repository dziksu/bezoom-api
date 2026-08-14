import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const MAP_MIN_ZOOM = 4;
export const MAP_MAX_ZOOM = 20;

export class MapEventsQueryDto {
  @ApiProperty({ example: 20.35, description: 'Western viewport longitude.' })
  @Type(() => Number)
  @IsLongitude()
  west: number;

  @ApiProperty({ example: 51.92, description: 'Southern viewport latitude.' })
  @Type(() => Number)
  @IsLatitude()
  south: number;

  @ApiProperty({ example: 21.67, description: 'Eastern viewport longitude.' })
  @Type(() => Number)
  @IsLongitude()
  east: number;

  @ApiProperty({ example: 52.55, description: 'Northern viewport latitude.' })
  @Type(() => Number)
  @IsLatitude()
  north: number;

  @ApiProperty({ example: 8, minimum: MAP_MIN_ZOOM, maximum: MAP_MAX_ZOOM })
  @Type(() => Number)
  @Min(MAP_MIN_ZOOM)
  @Max(MAP_MAX_ZOOM)
  zoom: number;

  @ApiPropertyOptional({
    example: 0,
    description: '0 = current week (Mon-Sun, Europe/Warsaw), 1 = next week, etc. Omit for no week filter.'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(52)
  week?: number;
}
