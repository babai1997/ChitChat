import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class OneTimePreKeyDto {
  @ApiProperty()
  @IsInt()
  keyId: number;

  @ApiProperty({ description: 'base64 x25519 public key' })
  @IsString()
  @IsNotEmpty()
  publicKey: string;
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Stable per-install id generated client-side' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({ description: 'base64 ed25519 public key — signs the signed prekey' })
  @IsString()
  @IsNotEmpty()
  identityKey: string;

  @ApiProperty({ description: 'base64 x25519 public key — this device\'s X3DH DH contribution' })
  @IsString()
  @IsNotEmpty()
  identityDhKey: string;

  @ApiProperty()
  @IsInt()
  registrationId: number;

  @ApiProperty()
  @IsInt()
  signedPreKeyId: number;

  @ApiProperty({ description: 'base64 x25519 public key' })
  @IsString()
  @IsNotEmpty()
  signedPreKeyPub: string;

  @ApiProperty({ description: 'base64 ed25519 signature over signedPreKeyPub' })
  @IsString()
  @IsNotEmpty()
  signedPreKeySig: string;

  @ApiProperty({ type: [OneTimePreKeyDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OneTimePreKeyDto)
  oneTimePreKeys: OneTimePreKeyDto[];

  @ApiProperty({
    required: false,
    enum: ['web', 'ios', 'android'],
    description: 'Cosmetic label shown in the device-link approval prompt/Linked Devices list',
  })
  @IsOptional()
  @IsIn(['web', 'ios', 'android'])
  platform?: string;
}
