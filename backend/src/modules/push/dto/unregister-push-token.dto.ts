import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UnregisterPushTokenDto {
  @ApiProperty({ description: 'Stable per-install id generated client-side' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}
