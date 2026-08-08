import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PushLinkPayloadDto {
  @ApiProperty({ description: "The new device's client-generated deviceId" })
  @IsString()
  @IsNotEmpty()
  newDeviceId: string;

  @ApiProperty({ description: 'Chat this history batch belongs to' })
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @ApiProperty({
    description:
      "Session-encrypted JSON array of this chat's recent messages, pairwise-encrypted to the new device via the caller's existing Phase-1 session with it",
  })
  @IsString()
  @IsNotEmpty()
  ciphertext: string;
}
