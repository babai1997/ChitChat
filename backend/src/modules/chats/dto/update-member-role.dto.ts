import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ChatMemberRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ChatMemberRole, description: 'New role for this member' })
  @IsEnum(ChatMemberRole)
  @IsNotEmpty()
  role: ChatMemberRole;
}
