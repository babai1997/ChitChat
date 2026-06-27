import { IsString, IsOptional, MaxLength, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Sudipta Pramanik', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.cloudinary.com/avatar.png' })
  @IsString()
  @IsOptional()
  @IsUrl({}, { message: 'Avatar URL must be a valid URL' })
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Hey there! I am using ChitChat.', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  about?: string;
}
