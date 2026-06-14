import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MessageType } from '@prisma/client';
import { AttachmentDto } from '../../messages/dto/create-message.dto';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @MaxLength(5000)
  content: string;

  @IsEnum(MessageType)
  @IsOptional()
  type?: MessageType;

  @IsString()
  @IsOptional()
  tempId?: string; // Client-side temp ID for optimistic updates

  @IsString()
  @IsOptional()
  replyToId?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
