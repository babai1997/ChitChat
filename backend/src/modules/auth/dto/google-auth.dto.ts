import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID token from the client SDK' })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class GoogleUserInfo {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sub: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  picture?: string;
}
