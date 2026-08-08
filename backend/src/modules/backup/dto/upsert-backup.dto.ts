import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpsertBackupDto {
  @ApiProperty({ description: 'base64 scrypt salt — not secret' })
  @IsString()
  @IsNotEmpty()
  salt: string;

  @ApiProperty({ description: 'base64 XChaCha20-Poly1305 nonce' })
  @IsString()
  @IsNotEmpty()
  nonce: string;

  @ApiProperty({ description: 'base64 ciphertext — opaque to the server' })
  @IsString()
  @IsNotEmpty()
  ciphertext: string;
}
