import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuthorityLevel,
  CapitalAccumulationType,
  IntelligenceCapitalCategory,
  IntelligenceCapitalStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
} from 'class-validator';
import { CAPITAL_SORT_FIELDS } from '../capital.constants';

// ---------------------------------------------------------------------------
// Intelligence Capital — create / update
// ---------------------------------------------------------------------------

export class CreateIntelligenceCapitalDto {
  @ApiProperty({ example: 'Sovereign knowledge reserve' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  identity: string;

  @ApiPropertyOptional({ example: 'Accumulated institutional knowledge capital.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: IntelligenceCapitalCategory,
    example: IntelligenceCapitalCategory.KNOWLEDGE,
  })
  @IsEnum(IntelligenceCapitalCategory)
  category: IntelligenceCapitalCategory;

  @ApiPropertyOptional({ description: 'Owner user id. Defaults to authenticated actor.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ example: 100, description: 'Opening capital value.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialValue?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Minimum reserve the capital may not fall below.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumValue?: number;

  @ApiPropertyOptional({ example: 0.05, description: 'Periodic growth rate (fraction).' })
  @IsOptional()
  @IsNumber()
  growthRate?: number;

  @ApiPropertyOptional({ example: 1, description: 'Preservation score (0-1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  preservationScore?: number;

  @ApiPropertyOptional({ example: 0, description: 'Risk score (0-1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  riskScore?: number;

  @ApiPropertyOptional({ example: 0.5, description: 'Confidence in the capital basis (0-1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ type: [String], description: 'Source lineage identifiers.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceLineage?: string[];

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.OPERATIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authority?: AuthorityLevel;

  @ApiPropertyOptional({ example: 'IUC' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  currency?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateIntelligenceCapitalDto {
  @ApiPropertyOptional({ example: 'Updated identity' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  identity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: IntelligenceCapitalCategory })
  @IsOptional()
  @IsEnum(IntelligenceCapitalCategory)
  category?: IntelligenceCapitalCategory;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumValue?: number;

  @ApiPropertyOptional({ example: 0.05 })
  @IsOptional()
  @IsNumber()
  growthRate?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  preservationScore?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  riskScore?: number;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceLineage?: string[];

  @ApiPropertyOptional({ enum: AuthorityLevel })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authority?: AuthorityLevel;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class TransitionCapitalStatusDto {
  @ApiProperty({ enum: IntelligenceCapitalStatus, example: IntelligenceCapitalStatus.PRESERVED })
  @IsEnum(IntelligenceCapitalStatus)
  status: IntelligenceCapitalStatus;

  @ApiPropertyOptional({ example: 'Entering preservation mode ahead of a market shock.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ---------------------------------------------------------------------------
// Accumulation engine
// ---------------------------------------------------------------------------

export class AccumulateCapitalDto {
  @ApiProperty({
    enum: CapitalAccumulationType,
    example: CapitalAccumulationType.GROWTH,
    description: 'The accumulation operation to apply.',
  })
  @IsEnum(CapitalAccumulationType)
  eventType: CapitalAccumulationType;

  @ApiPropertyOptional({
    example: 25,
    description: 'Absolute amount for CREATION/GROWTH/REDUCTION/RECOVERY operations.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    example: 0.05,
    description: 'Rate for COMPOUNDING/DECAY operations (fraction of current value).',
  })
  @IsOptional()
  @IsNumber()
  rate?: number;

  @ApiPropertyOptional({ example: 'Quarterly knowledge compounding.' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Allocation execution / rollback
// ---------------------------------------------------------------------------

export class ExecuteAllocationDto {
  @ApiProperty({ description: 'Intelligence capital id to draw the allocation from.' })
  @IsString()
  @MinLength(1)
  capitalId: string;

  @ApiPropertyOptional({
    example: 0.8,
    description: 'Override the maximum allocation ratio (0-1).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  maxAllocationRatio?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Request a founder override of non-constitutional allocation rules.',
  })
  @IsOptional()
  @IsBoolean()
  founderOverride?: boolean;

  @ApiPropertyOptional({ example: 'Sovereign directive ONX-FIC-014.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RollbackAllocationDto {
  @ApiPropertyOptional({ example: 'Allocation outcome failed downstream validation.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export class IntelligenceCapitalListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: IntelligenceCapitalCategory })
  @IsOptional()
  @IsEnum(IntelligenceCapitalCategory)
  category?: IntelligenceCapitalCategory;

  @ApiPropertyOptional({ enum: IntelligenceCapitalStatus })
  @IsOptional()
  @IsEnum(IntelligenceCapitalStatus)
  status?: IntelligenceCapitalStatus;

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

  @ApiPropertyOptional({ enum: CAPITAL_SORT_FIELDS })
  @IsOptional()
  @IsString()
  sortBy?: (typeof CAPITAL_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
