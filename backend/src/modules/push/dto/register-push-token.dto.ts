import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PushPlatform, PushTokenType } from '@prisma/client';

export class RegisterPushTokenDto {
  @ApiProperty({ description: 'Stable per-install id generated client-side' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({ enum: PushPlatform })
  @IsEnum(PushPlatform)
  platform: PushPlatform;

  @ApiProperty({ enum: PushTokenType })
  @IsEnum(PushTokenType)
  tokenType: PushTokenType;

  @ApiProperty({ description: 'FCM registration token or APNs VoIP token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
