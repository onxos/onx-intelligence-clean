import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PATTERN_TYPES } from '../understanding.constants';

export class DetectPatternsDto {
  @ApiProperty({
    type: [String],
    example: ['RC-1', 'RC-2', 'RC-3'],
    description: 'Source perception record ids.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  perceptionIds: string[];

  @ApiPropertyOptional({ example: 'clinical' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ enum: PATTERN_TYPES, example: 'behavioral' })
  @IsOptional()
  @IsString()
  @IsIn(PATTERN_TYPES as unknown as string[])
  patternType?: string;

  @ApiPropertyOptional({ type: Object, example: {} })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;

  @ApiPropertyOptional({ example: 'trace-t1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  traceId?: string;
}

export class MatchContextDto {
  @ApiProperty({ example: 'PT-1', description: 'DetectedPattern patternId.' })
  @IsString()
  patternId: string;

  @ApiPropertyOptional({ type: [String], description: 'Historical precedent ids.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  matchedContexts?: string[];

  @ApiPropertyOptional({ example: 'Recurring no-show pattern after slot changes.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  interpretation?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;
}

export class ExtractMeaningDto {
  @ApiProperty({ example: 'CX-1', description: 'ContextualizedPattern contextId.' })
  @IsString()
  contextId: string;

  @ApiPropertyOptional({ example: '48h communication prevents no-show spikes.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  meaning?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceBasis?: string[];

  @ApiPropertyOptional({ type: [String], example: ['FI-2026-0017'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedIntents?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;
}

export class RunPipelineDto {
  @ApiProperty({ type: [String], example: ['RC-1', 'RC-2', 'RC-3'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  perceptionIds: string[];

  @ApiPropertyOptional({ example: 'clinical' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ enum: PATTERN_TYPES })
  @IsOptional()
  @IsString()
  @IsIn(PATTERN_TYPES as unknown as string[])
  patternType?: string;

  @ApiPropertyOptional({ example: 'Institutional meaning of the pattern.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  meaning?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedIntents?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;
}

export class UnderstandingListQueryDto {
  @ApiPropertyOptional({ example: 'clinical' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ example: 'detected' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'proven', description: 'Understanding objects only.' })
  @IsOptional()
  @IsString()
  realityTier?: string;

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
