import { IsArray, IsIn, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';

// Only the three types the "All Media" screen groups messages into — 'text'
// (for link-scanning, client-side only, see ChatGalleryModal) and system/
// call-log types are irrelevant here and deliberately not accepted.
const GALLERY_TYPES = [
  MessageType.image,
  MessageType.video,
  MessageType.audio,
  MessageType.file,
] as const;

export class GalleryQueryDto {
  @ApiPropertyOptional({
    enum: GALLERY_TYPES,
    isArray: true,
    description: 'Which message types to include — e.g. image,video for the Media tab, file for Docs.',
  })
  @IsArray()
  @IsIn(GALLERY_TYPES, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  types: MessageType[];

  @ApiPropertyOptional({ description: 'Message ID used as cursor for pagination — returns messages older than this one.' })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 30;
}
