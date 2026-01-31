import { IsUUID, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ChatMemberRole } from '@prisma/client';

export class AddMemberDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsEnum(ChatMemberRole)
  @IsOptional()
  role?: ChatMemberRole;
}
