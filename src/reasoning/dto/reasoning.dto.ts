import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReasoningMode } from '@prisma/client';
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
// Part C — reasoning input signals (all sourced from existing runtimes)
// ---------------------------------------------------------------------------

export class ReasoningContextDto {
  @ApiProperty({ description: 'Source runtime tag, e.g. D16, D17, FIAR, IFC, FIC.' })
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

export class ReasoningEvidenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ description: 'Source runtime tag.' })
  @IsOptional()
  @IsString()
  runtime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string;
}

export class ReasoningConstraintDto {
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
    description: 'Required constraints, when unsatisfied, contest the reasoning result.',
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class StartReasoningDto {
  @ApiProperty({ enum: ReasoningMode })
  @IsEnum(ReasoningMode)
  mode: ReasoningMode;

  @ApiProperty({ example: 'Is the institutional flourishing profile improving?' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  question: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  objective?: string;

  @ApiPropertyOptional({ type: [ReasoningContextDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReasoningContextDto)
  contexts?: ReasoningContextDto[];

  @ApiPropertyOptional({ type: [ReasoningEvidenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReasoningEvidenceDto)
  evidence?: ReasoningEvidenceDto[];

  @ApiPropertyOptional({ type: [ReasoningConstraintDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReasoningConstraintDto)
  constraints?: ReasoningConstraintDto[];

  @ApiPropertyOptional({
    description: 'Founder guidance directive (used by FOUNDER_GUIDED / CONSTITUTIONAL modes).',
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

export class ReasoningOverrideDto {
  @ApiProperty({ example: 'Founder override: freeze reasoning session pending review' })
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

  @ApiPropertyOptional({ enum: ReasoningMode })
  @IsOptional()
  @IsEnum(ReasoningMode)
  mode?: ReasoningMode;

  @ApiPropertyOptional({ description: 'Search on the reasoning question.' })
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
