import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, Min, Max, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
