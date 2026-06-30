import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CapitalCategory, EvolutionType, LearningStateType, PatternType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { LEARNING_SORT_FIELDS, PATTERN_SORT_FIELDS } from '../intelligence-learning.constants';

export class CreateLearningDto {
  @ApiProperty({ example: 'Recurring capital efficiency signal' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({ example: 'Observation summary.' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: 'Originating intelligence object id.' })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({ example: 0.5, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateLearningDto {
  @ApiPropertyOptional({ example: 'Updated learning title' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated summary' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ example: 0.85, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class LearningListQueryDto {
  @ApiPropertyOptional({ example: 'efficiency' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: LearningStateType, example: LearningStateType.OBSERVED })
  @IsOptional()
  @IsEnum(LearningStateType)
  state?: LearningStateType;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ enum: LEARNING_SORT_FIELDS, example: 'createdAt' })
  @IsOptional()
  @IsIn(LEARNING_SORT_FIELDS)
  sortBy?: (typeof LEARNING_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class LearningTransitionDto {
  @ApiProperty({ enum: LearningStateType, example: LearningStateType.UNDERSTOOD })
  @IsEnum(LearningStateType)
  toState: LearningStateType;

  @ApiPropertyOptional({ example: 'Pattern understood after reinforcement.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReinforceLearningDto {
  @ApiPropertyOptional({ example: 'Observed again in Q3 data.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordEvolutionDto {
  @ApiProperty({ enum: EvolutionType, example: EvolutionType.REFINEMENT })
  @IsEnum(EvolutionType)
  evolutionType: EvolutionType;

  @ApiPropertyOptional({ example: 'Refined generalization after new evidence.' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  before?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  after?: Record<string, unknown>;
}

export class CapitalizeLearningDto {
  @ApiPropertyOptional({ example: 'Manual capitalization by operator.' })
  @IsOptional()
  @IsString()
  triggerReason?: string;

  @ApiPropertyOptional({ example: 100, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  capitalValue?: number;

  @ApiPropertyOptional({ enum: CapitalCategory, example: CapitalCategory.KNOWLEDGE })
  @IsOptional()
  @IsEnum(CapitalCategory)
  capitalCategory?: CapitalCategory;
}

export class RegisterPatternDto {
  @ApiProperty({ enum: PatternType, example: PatternType.SIMILARITY })
  @IsEnum(PatternType)
  patternType: PatternType;

  @ApiProperty({ example: 'Recurring capital efficiency cluster' })
  @IsString()
  @MinLength(1)
  label: string;

  @ApiPropertyOptional({ example: 'Description of the discovered pattern.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 0.7, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  strength?: number;

  @ApiPropertyOptional({ type: [String], example: ['obj-1', 'obj-2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberObjectIds?: string[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class PatternListQueryDto {
  @ApiPropertyOptional({ enum: PatternType, example: PatternType.REPETITION })
  @IsOptional()
  @IsEnum(PatternType)
  patternType?: PatternType;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ enum: PATTERN_SORT_FIELDS, example: 'createdAt' })
  @IsOptional()
  @IsIn(PATTERN_SORT_FIELDS)
  sortBy?: (typeof PATTERN_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
