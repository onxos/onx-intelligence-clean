import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DecisionMode } from '@prisma/client';
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
  ValidateNested,
} from 'class-validator';

// ---------------------------------------------------------------------------
// Part C — decision input signals (all sourced from existing runtimes)
// ---------------------------------------------------------------------------

export class DecisionCandidateDto {
  @ApiProperty({ description: 'Candidate label.' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  label: string;

  @ApiPropertyOptional({ description: 'Candidate description.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 0.5, description: 'Expected benefit.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  benefit?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 0, description: 'Expected cost.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  cost?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Constitutional admissibility; inadmissible candidates are filtered out.',
  })
  @IsOptional()
  @IsBoolean()
  admissible?: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1,
    description: 'Reasoning confidence for the candidate (from the Reasoning Engine).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  reasoningConfidence?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1,
    description: 'Planning readiness for the candidate (from the Planning Engine).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  planningReadiness?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1,
    description: 'Capital support for the candidate (from Capital / IFC / IUC).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  capitalSupport?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Whether the candidate honours the constraint set.',
  })
  @IsOptional()
  @IsBoolean()
  constraintsSatisfied?: boolean;

  @ApiPropertyOptional({ description: 'Cross-runtime reference id (by value only).' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Cross-runtime reference type.' })
  @IsOptional()
  @IsString()
  referenceType?: string;
}

export class DecisionConstraintDto {
  @ApiProperty({ description: 'Constraint name.' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ description: 'Whether the constraint is currently satisfied.' })
  @IsBoolean()
  satisfied: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Required constraints, when unsatisfied, contest the decision.',
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}

export class DecisionContextDto {
  @ApiProperty({
    description: 'Source runtime tag, e.g. REASONING, PLANNING, D17, CAPITAL, FIAR, IFC, FIC.',
  })
  @IsString()
  @MinLength(1)
  runtime: string;

  @ApiProperty({ description: 'Role of the context, e.g. REASONING, PLAN, MEASUREMENT, CAPITAL.' })
  @IsString()
  @MinLength(1)
  role: string;

  @ApiPropertyOptional({ description: 'Cross-runtime reference id (by value only).' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Cross-runtime reference type.' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;
}

export class StartDecisionDto {
  @ApiProperty({ enum: DecisionMode })
  @IsEnum(DecisionMode)
  mode: DecisionMode;

  @ApiProperty({ example: 'Choose the constitutionally valid path to strengthen flourishing.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  objective: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  focus?: string;

  @ApiPropertyOptional({ type: [DecisionCandidateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionCandidateDto)
  candidates?: DecisionCandidateDto[];

  @ApiPropertyOptional({ type: [DecisionConstraintDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionConstraintDto)
  constraints?: DecisionConstraintDto[];

  @ApiPropertyOptional({ type: [DecisionContextDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionContextDto)
  contexts?: DecisionContextDto[];

  @ApiPropertyOptional({
    description: 'Founder guidance directive (used by FOUNDER / CONSTITUTIONAL modes).',
  })
  @IsOptional()
  @IsString()
  founderGuidance?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part F — override
// ---------------------------------------------------------------------------

export class DecisionOverrideDto {
  @ApiProperty({ example: 'Founder override: freeze decision session pending review' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  directive: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  constitutionalRef?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Query DTOs
// ---------------------------------------------------------------------------

export class ListSessionsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: DecisionMode })
  @IsOptional()
  @IsEnum(DecisionMode)
  mode?: DecisionMode;

  @ApiPropertyOptional({ description: 'Search on the decision objective.' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class StreamQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
