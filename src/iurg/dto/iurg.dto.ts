import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';

export class IurgListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class IurgQueryDto {
  @ApiPropertyOptional({ example: 'FI-2026-0001', description: 'Filter by Founder Intent ref.' })
  @IsOptional()
  @IsString()
  intentId?: string;

  @ApiPropertyOptional({ example: 'HC-08', description: 'Filter by constraint id.' })
  @IsOptional()
  @IsString()
  constraintId?: string;

  @ApiPropertyOptional({
    example: 'violation',
    description: 'Filter by event type (enforcement|violation|conflict|override|review|amendment).',
  })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({
    example: '2026-07-01T00:00:00.000Z',
    description: 'Range start (ISO-8601).',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-07-31T23:59:59.000Z',
    description: 'Range end (ISO-8601).',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
