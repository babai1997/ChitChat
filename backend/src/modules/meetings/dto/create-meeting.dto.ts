import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMeetingDto {
  @ApiProperty({ required: false, description: 'Custom meeting room name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
