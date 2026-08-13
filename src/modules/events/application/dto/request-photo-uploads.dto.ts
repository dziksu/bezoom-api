import { IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class PhotoUploadRequestItemDto {
  @ApiProperty({ enum: ALLOWED_MIME_TYPES, example: 'image/jpeg' })
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType: string;
}

export class RequestPhotoUploadsDto {
  @ApiProperty({ type: [PhotoUploadRequestItemDto], minItems: 1, maxItems: 5 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PhotoUploadRequestItemDto)
  files: PhotoUploadRequestItemDto[];
}

export class PhotoUploadTargetDto {
  @ApiProperty()
  photoId: string;

  @ApiProperty()
  uploadUrl: string;

  @ApiProperty()
  expiresInSeconds: number;
}
