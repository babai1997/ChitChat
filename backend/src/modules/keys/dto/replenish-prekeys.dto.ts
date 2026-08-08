import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { OneTimePreKeyDto } from './register-device.dto';

export class ReplenishPreKeysDto {
  @ApiProperty({ description: 'Which of this user\'s devices to top up' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({ type: [OneTimePreKeyDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OneTimePreKeyDto)
  oneTimePreKeys: OneTimePreKeyDto[];
}
