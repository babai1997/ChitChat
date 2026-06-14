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
import { MessageType } from '@prisma/client';

export class AttachmentDto {
  @IsString()
  filename: string;

  @IsString()
  url: string;

  @IsString()
  mimetype: string;

  @IsNumber()
  size: number;
}

export class CreateMessageDto {
  @IsString()
  @MaxLength(5000)
  content: string;

  @IsEnum(MessageType)
  @IsOptional()
  type?: MessageType;

  @IsUUID()
  @IsOptional()
  replyToId?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
