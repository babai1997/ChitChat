import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MessageType } from '@prisma/client';
import { AttachmentDto, MessageCipherDto } from '../../messages/dto';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  // Required for plaintext messages; omitted for encrypted ones (see ciphers).
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  content?: string;

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

  @IsBoolean()
  @IsOptional()
  isEncrypted?: boolean;

  // DIRECT chats only — one Double Ratchet ciphertext per recipient device.
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MessageCipherDto)
  ciphers?: MessageCipherDto[];

  // GROUP chats only — the Sender Key chain's ciphertext, identical for
  // every recipient (see messages.service.ts's create()). Mutually
  // exclusive with `ciphers`.
  @IsString()
  @IsOptional()
  groupCiphertext?: string;
}
