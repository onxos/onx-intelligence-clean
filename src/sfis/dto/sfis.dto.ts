import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScanOutputDto {
  @ApiProperty({
    example: 'ONX institutional judgment: promote refined triage protocol...',
    description: 'The output text to scan before delivery.',
  })
  @IsString()
  @MaxLength(20000)
  outputText: string;

  @ApiPropertyOptional({
    example: 'output',
    description: 'output | architecture (architecture routes to the L2 drift check).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  outputType?: string;

  @ApiPropertyOptional({
    example: 'chatbot',
    description: 'Optional self-declared category; commodity categories are auto-rejected.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  proposedCategory?: string;

  @ApiPropertyOptional({ example: 'trace-sfis-1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  traceId?: string;
}

export class ModelCheckItemDto {
  @ApiProperty({ example: 'gpt' })
  @IsString()
  modelName: string;

  @ApiPropertyOptional({
    example: 'available',
    enum: ['available', 'degraded', 'unavailable', 'unknown'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  configValid?: boolean;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  latencyMs?: number;
}

export class CheckModelsDto {
  @ApiPropertyOptional({
    type: [ModelCheckItemDto],
    description: 'Per-model status overrides. Unspecified frontier models default to available.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModelCheckItemDto)
  models?: ModelCheckItemDto[];
}

export class SfisListQueryDto {
  @ApiPropertyOptional({ example: 'L1', enum: ['L1', 'L2'] })
  @IsOptional()
  @IsString()
  layer?: string;

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
