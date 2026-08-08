import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsArray,
  MaxLength,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';
import { MessageCipherDto } from './message-cipher.dto';

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
  // Required for plaintext messages; omitted for encrypted ones, where the
  // real content lives only in `ciphers` — see isEncrypted below.
  @ApiPropertyOptional({ example: 'Hello!', maxLength: 5000 })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  content?: string;

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

  @ApiPropertyOptional({ description: 'True if content is E2EE ciphertext, not plaintext' })
  @IsBoolean()
  @IsOptional()
  isEncrypted?: boolean;

  @ApiPropertyOptional({ type: [MessageCipherDto], description: 'DIRECT chats: per-recipient-device ciphertext, required when isEncrypted is true' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MessageCipherDto)
  ciphers?: MessageCipherDto[];

  @ApiPropertyOptional({ description: "GROUP chats: the Sender Key chain's ciphertext, identical for every recipient. Mutually exclusive with `ciphers`." })
  @IsString()
  @IsOptional()
  groupCiphertext?: string;
}
