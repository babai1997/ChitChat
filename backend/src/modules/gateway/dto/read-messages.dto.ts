import { IsString, IsNotEmpty, IsArray } from 'class-validator';

export class ReadMessagesDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsArray()
  @IsString({ each: true })
  messageIds: string[];
}
