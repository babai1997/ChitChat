import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateDirectChatDto {
  @IsUUID()
  @IsNotEmpty()
  participantId: string;
}
