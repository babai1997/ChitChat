import { IsUUID, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatMemberRole } from '@prisma/client';

export class AddMemberDto {
  @ApiProperty({ example: 'uuid-of-user', description: 'User ID to add to the group' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ enum: ChatMemberRole, default: ChatMemberRole.member })
  @IsEnum(ChatMemberRole)
  @IsOptional()
  role?: ChatMemberRole;
}
