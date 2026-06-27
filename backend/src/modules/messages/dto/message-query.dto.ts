import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MessageQueryDto {
  @ApiPropertyOptional({ description: 'Message ID used as cursor for pagination' })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 50;

  @ApiPropertyOptional({ enum: ['before', 'after'], default: 'before' })
  @IsString()
  @IsOptional()
  direction?: 'before' | 'after' = 'before';
}
