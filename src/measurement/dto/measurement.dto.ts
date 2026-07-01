import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuthorityLevel,
  MeasurementFailureType,
  MeasurementFeedbackType,
  MeasurementIndexType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MEASUREMENT_SORT_FIELDS } from '../measurement.constants';

// ---------------------------------------------------------------------------
// Profile — create / update
// ---------------------------------------------------------------------------

export class CreateMeasurementProfileDto {
  @ApiProperty({ example: 'Sovereign understanding quality' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Measures the quality of institutional understanding.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: MeasurementIndexType, example: MeasurementIndexType.UQI })
  @IsEnum(MeasurementIndexType)
  indexType: MeasurementIndexType;

  @ApiPropertyOptional({ description: 'Owner user id. Defaults to authenticated actor.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ example: 1, description: 'Target raw value.' })
  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @ApiPropertyOptional({ example: 0, description: 'Minimum acceptable raw value.' })
  @IsOptional()
  @IsNumber()
  minimumValue?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Profile-level weight applied to the raw score.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ example: 0, description: 'Lower bound of the normalization band.' })
  @IsOptional()
  @IsNumber()
  normalizationMin?: number;

  @ApiPropertyOptional({ example: 100, description: 'Upper bound of the normalization band.' })
  @IsOptional()
  @IsNumber()
  normalizationMax?: number;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.OPERATIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authority?: AuthorityLevel;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateMeasurementProfileDto {
  @ApiPropertyOptional({ example: 'Updated name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  minimumValue?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  normalizationMin?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  normalizationMax?: number;

  @ApiPropertyOptional({ enum: AuthorityLevel })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authority?: AuthorityLevel;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export class MeasurementComponentDto {
  @ApiProperty({ example: 'evidence_density' })
  @IsString()
  @MinLength(1)
  key: string;

  @ApiProperty({ example: 0.8 })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ example: 0.9, description: 'Component confidence (0-1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class CalculateMeasurementDto {
  @ApiProperty({ type: [MeasurementComponentDto], description: 'Scored components to aggregate.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeasurementComponentDto)
  components: MeasurementComponentDto[];

  @ApiPropertyOptional({ example: 'Quarterly recalculation.' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Benchmark + evidence
// ---------------------------------------------------------------------------

export class CreateBenchmarkDto {
  @ApiProperty({ example: 'Institutional baseline' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 75, description: 'Benchmark value on the normalized scale.' })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ enum: ['GTE', 'LTE', 'EQ'], example: 'GTE' })
  @IsOptional()
  @IsString()
  comparator?: 'GTE' | 'LTE' | 'EQ';

  @ApiPropertyOptional({ example: 'ATLAS_V6_READINESS' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AddMeasurementEvidenceDto {
  @ApiProperty({ example: 'Validated by independent governance audit.' })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiPropertyOptional({ description: 'Linked evidence record id.' })
  @IsOptional()
  @IsString()
  evidenceRecordId?: string;

  @ApiPropertyOptional({ description: 'Linked intelligence object id.' })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Feedback + failure
// ---------------------------------------------------------------------------

export class RecordFeedbackDto {
  @ApiProperty({
    enum: MeasurementFeedbackType,
    example: MeasurementFeedbackType.LEARNING_FEEDBACK,
  })
  @IsEnum(MeasurementFeedbackType)
  feedbackType: MeasurementFeedbackType;

  @ApiPropertyOptional({
    enum: ['LEARNING', 'CAPITAL', 'KNOWLEDGE', 'MEASUREMENT'],
    example: 'LEARNING',
  })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({ description: 'Identifier of the target entity receiving feedback.' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional({ example: 'Increase reinforcement weighting for low-confidence units.' })
  @IsOptional()
  @IsString()
  recommendation?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class RecordFailureDto {
  @ApiProperty({ enum: MeasurementFailureType, example: MeasurementFailureType.LOW_CONFIDENCE })
  @IsEnum(MeasurementFailureType)
  failureType: MeasurementFailureType;

  @ApiPropertyOptional({ enum: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], example: 'HIGH' })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiProperty({ example: 'Measurement lacks supporting evidence above the required weight.' })
  @IsString()
  @MinLength(1)
  notes: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export class MeasurementListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: MeasurementIndexType })
  @IsOptional()
  @IsEnum(MeasurementIndexType)
  indexType?: MeasurementIndexType;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional({ enum: MEASUREMENT_SORT_FIELDS })
  @IsOptional()
  @IsString()
  sortBy?: (typeof MEASUREMENT_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class TrendQueryDto {
  @ApiPropertyOptional({ example: 20, description: 'Number of recent records to analyse.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
