import { IsString, IsOptional, IsEnum, IsUUID, MaxLength } from 'class-validator';
import { MessageType } from '@prisma/client';

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
  attachments?: {
    filename: string;
    url: string;
    mimetype: string;
    size: number;
  }[];
}
