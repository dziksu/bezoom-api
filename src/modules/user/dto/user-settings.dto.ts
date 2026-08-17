import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO31661Alpha2,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AccountTheme {
  LIGHT = 'LIGHT',
  DARK = 'DARK'
}

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({ enum: AccountTheme, example: AccountTheme.DARK })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsEnum(AccountTheme)
  theme?: AccountTheme;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean()
  eventRemindersEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean()
  nearbyEventsEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean()
  socialActivityEnabled?: boolean;

  @ApiPropertyOptional({ example: 'pl', description: 'ISO 639 language code, optionally with an ISO country.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => normalizeLanguage(value))
  @Matches(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)
  language?: string;

  @ApiPropertyOptional({ example: 'PL', description: 'ISO 3166-1 alpha-2 country code.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsISO31661Alpha2()
  country?: string;

  @ApiPropertyOptional({ example: 'PLN', description: 'ISO 4217 currency code.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsISO4217CurrencyCode()
  currency?: string;

  @ApiPropertyOptional({ example: 'Europe/Warsaw', description: 'IANA time zone name.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsTimeZone()
  timeZone?: string;
}

export class UserSettingsResponseDto {
  @ApiProperty({ enum: AccountTheme })
  theme: AccountTheme;

  @ApiProperty()
  eventRemindersEnabled: boolean;

  @ApiProperty()
  nearbyEventsEnabled: boolean;

  @ApiProperty()
  socialActivityEnabled: boolean;

  @ApiProperty({ example: 'pl' })
  language: string;

  @ApiProperty({ example: 'PL' })
  country: string;

  @ApiProperty({ example: 'PLN' })
  currency: string;

  @ApiProperty({ example: 'Europe/Warsaw' })
  timeZone: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

function normalizeLanguage(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const [language, country, ...rest] = value.trim().split('-');
  if (rest.length > 0) return value.trim();
  return country ? `${language.toLowerCase()}-${country.toUpperCase()}` : language.toLowerCase();
}
