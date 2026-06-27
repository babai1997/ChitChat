import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDirectChatDto {
  @ApiProperty({ example: 'uuid-of-target-user', description: 'User ID to start a direct chat with' })
  @IsUUID()
  @IsNotEmpty()
  participantId: string;
}
