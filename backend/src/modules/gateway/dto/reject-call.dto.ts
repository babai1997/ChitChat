import { IsString, IsNotEmpty } from 'class-validator';

export class RejectCallDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @IsNotEmpty()
  callerId: string;
}
