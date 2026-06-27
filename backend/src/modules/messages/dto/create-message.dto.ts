import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';

export class AttachmentDto {
  @ApiProperty({ example: 'photo.jpg' })
  @IsString()
  filename: string;

  @ApiProperty({ example: 'https://cdn.cloudinary.com/...' })
  @IsString()
  url: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimetype: string;

  @ApiProperty({ example: 204800 })
  @IsNumber()
  size: number;
}

export class CreateMessageDto {
  @ApiProperty({ example: 'Hello!', maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional({ enum: MessageType, default: MessageType.text })
  @IsEnum(MessageType)
  @IsOptional()
  type?: MessageType;

  @ApiPropertyOptional({ example: 'uuid-of-message-being-replied-to' })
  @IsUUID()
  @IsOptional()
  replyToId?: string;

  @ApiPropertyOptional({ type: [AttachmentDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
