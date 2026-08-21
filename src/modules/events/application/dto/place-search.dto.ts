import { IsLatitude, IsLongitude, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PlaceSearchQueryDto {
  @ApiProperty({ example: 'Rynek Główny 1, Kraków' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  q: string;
}

export class ReverseGeocodeQueryDto {
  @ApiProperty()
  @IsLatitude()
  lat: number;

  @ApiProperty()
  @IsLongitude()
  lng: number;
}

export class PlaceSuggestionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ required: false })
  address?: string;

  @ApiProperty({ required: false })
  city?: string;

  @ApiProperty()
  country: string;
}
