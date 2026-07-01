import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanningMode } from '@prisma/client';
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
// Part C — planning input signals (all sourced from existing runtimes)
// ---------------------------------------------------------------------------

export class PlanningGoalDto {
  @ApiProperty({ description: 'Goal title.' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional({ description: 'Goal description; improves goal clarity.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Goal priority; higher is planned first.', default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;

  @ApiPropertyOptional({ description: 'Whether the goal is measurable; improves clarity.' })
  @IsOptional()
  @IsBoolean()
  measurable?: boolean;

  @ApiPropertyOptional({ description: 'Cross-runtime reference id (by value only).' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Cross-runtime reference type.' })
  @IsOptional()
  @IsString()
  referenceType?: string;
}

export class PlanningConstraintDto {
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
    description: 'Required constraints, when unsatisfied, block the plan.',
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}

export class PlanningContextDto {
  @ApiProperty({ description: 'Source runtime tag, e.g. REASONING, D16, D17, FIAR, IFC, FIC.' })
  @IsString()
  @MinLength(1)
  runtime: string;

  @ApiProperty({ description: 'Role of the context, e.g. PREMISE, KNOWLEDGE, MEASUREMENT.' })
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

export class PlanningResourceDto {
  @ApiProperty({ description: 'Resource name.' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ default: true, description: 'Whether the resource is required.' })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Whether the resource is available.' })
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional({ description: 'Estimated demand for the resource.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  demand?: number;

  @ApiPropertyOptional({ description: 'Available capacity of the resource.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  capacity?: number;
}

export class StartPlanningDto {
  @ApiProperty({ enum: PlanningMode })
  @IsEnum(PlanningMode)
  mode: PlanningMode;

  @ApiProperty({ example: 'Prepare a plan to strengthen institutional flourishing next quarter.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  objective: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  focus?: string;

  @ApiPropertyOptional({ type: [PlanningGoalDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanningGoalDto)
  goals?: PlanningGoalDto[];

  @ApiPropertyOptional({ type: [PlanningConstraintDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanningConstraintDto)
  constraints?: PlanningConstraintDto[];

  @ApiPropertyOptional({ type: [PlanningContextDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanningContextDto)
  contexts?: PlanningContextDto[];

  @ApiPropertyOptional({ type: [PlanningResourceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanningResourceDto)
  resources?: PlanningResourceDto[];

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

export class PlanningOverrideDto {
  @ApiProperty({ example: 'Founder override: freeze planning session pending review' })
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

  @ApiPropertyOptional({ enum: PlanningMode })
  @IsOptional()
  @IsEnum(PlanningMode)
  mode?: PlanningMode;

  @ApiPropertyOptional({ description: 'Search on the planning objective.' })
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
