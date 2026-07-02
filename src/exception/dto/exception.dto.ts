import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class TriggerOverrideDto {
  @ApiProperty({ example: 'OR-01', description: 'The override rule (OR-01..OR-05).' })
  @IsString()
  @MaxLength(20)
  overrideRule: string;

  @ApiPropertyOptional({ example: 'head-veterinarian' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  triggeredBy?: string;

  @ApiPropertyOptional({ type: [String], example: ['animal in critical condition'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];

  @ApiPropertyOptional({ example: 'Emergency surgery outside normal approval window.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional({ example: 'trace-or-1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  traceId?: string;
}

export class ExceptionListQueryDto {
  @ApiPropertyOptional({ example: 'active', enum: ['active', 'expired', 'reverted'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'OR-01' })
  @IsOptional()
  @IsString()
  overrideRule?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
