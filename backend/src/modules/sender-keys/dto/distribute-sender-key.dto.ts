import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SenderKeyTargetDto {
  @ApiProperty({ description: "Recipient's userId" })
  @IsString()
  @IsNotEmpty()
  recipientUserId: string;

  @ApiProperty({ description: "Recipient's deviceId" })
  @IsString()
  @IsNotEmpty()
  recipientDeviceId: string;

  @ApiProperty({
    description:
      'The SenderKeyDistributionMessage, pairwise-encrypted (Double Ratchet) for this specific recipient device',
  })
  @IsString()
  @IsNotEmpty()
  ciphertext: string;
}

export class DistributeSenderKeyDto {
  @ApiProperty({ description: "The sending device's deviceId (the chain owner)" })
  @IsString()
  @IsNotEmpty()
  senderDeviceId: string;

  @ApiProperty({ type: [SenderKeyTargetDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SenderKeyTargetDto)
  targets: SenderKeyTargetDto[];
}
