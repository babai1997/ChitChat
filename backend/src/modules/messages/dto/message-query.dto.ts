import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class MessageQueryDto {
  @IsString()
  @IsOptional()
  cursor?: string; // message id or timestamp for cursor-based pagination

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 50;

  @IsString()
  @IsOptional()
  direction?: 'before' | 'after' = 'before';
}
