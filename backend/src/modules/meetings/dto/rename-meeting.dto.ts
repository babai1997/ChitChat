import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameMeetingDto {
  @ApiProperty({ description: 'New meeting room name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
