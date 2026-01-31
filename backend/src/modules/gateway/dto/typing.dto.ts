import { IsString, IsNotEmpty } from 'class-validator';

export class TypingDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;
}
