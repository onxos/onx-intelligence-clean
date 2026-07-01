import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetaArbitrationType, MetaOverrideType, MetaRouteTarget } from '@prisma/client';
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

// ---------------------------------------------------------------------------
// Part A — Orchestration
// ---------------------------------------------------------------------------

export class CreateOrchestrationDto {
  @ApiProperty({ example: 'Cross-runtime capital reconciliation' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Owner user id. Defaults to authenticated actor.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ example: 'Reconcile capital across D13 and D19' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ example: 'CAPITAL' })
  @IsOptional()
  @IsString()
  targetDomain?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class PlanStepInputDto {
  @ApiProperty({ example: 'Load capital allocations' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ enum: MetaRouteTarget })
  @IsOptional()
  @IsEnum(MetaRouteTarget)
  target?: MetaRouteTarget;

  @ApiPropertyOptional({ description: 'Free-text intent used to resolve routing.' })
  @IsOptional()
  @IsString()
  intent?: string;
}

export class StartOrchestrationDto {
  @ApiPropertyOptional({ example: 'Execution plan v1' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  planName?: string;

  @ApiPropertyOptional({ type: [PlanStepInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanStepInputDto)
  steps?: PlanStepInputDto[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part B — Routing
// ---------------------------------------------------------------------------

export class RoutingCandidateDto {
  @ApiProperty({ enum: MetaRouteTarget })
  @IsEnum(MetaRouteTarget)
  target: MetaRouteTarget;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  priority?: number;
}

export class RouteDto {
  @ApiPropertyOptional({
    enum: MetaRouteTarget,
    description: 'Explicit target overrides resolution.',
  })
  @IsOptional()
  @IsEnum(MetaRouteTarget)
  target?: MetaRouteTarget;

  @ApiPropertyOptional({ example: 'allocate capital to provider' })
  @IsOptional()
  @IsString()
  intent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ type: [RoutingCandidateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingCandidateDto)
  candidates?: RoutingCandidateDto[];
}

// ---------------------------------------------------------------------------
// Part C — Arbitration
// ---------------------------------------------------------------------------

export class ArbitrationPathDto {
  @ApiProperty({ example: 'path-a' })
  @IsString()
  @MinLength(1)
  id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  priority?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  authority?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  evidence?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  capital?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  execution?: number;
}

export class ArbitrateDto {
  @ApiProperty({ enum: MetaArbitrationType })
  @IsEnum(MetaArbitrationType)
  type: MetaArbitrationType;

  @ApiProperty({ type: [ArbitrationPathDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArbitrationPathDto)
  paths: ArbitrationPathDto[];
}

// ---------------------------------------------------------------------------
// Part D — Merge
// ---------------------------------------------------------------------------

export class MergeRequestDto {
  @ApiProperty({ type: [String], example: ['path-a', 'path-b'] })
  @IsArray()
  @IsString({ each: true })
  sourcePaths: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class MergeRollbackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

// ---------------------------------------------------------------------------
// Part E — Founder override
// ---------------------------------------------------------------------------

export class OverrideDto {
  @ApiProperty({ enum: MetaOverrideType })
  @IsEnum(MetaOverrideType)
  overrideType: MetaOverrideType;

  @ApiProperty({ example: 'Force execution path B under founder authority' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  directive: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetReferenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetReferenceType?: string;

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
// Part G — Governance policies
// ---------------------------------------------------------------------------

export class CreatePolicyDto {
  @ApiProperty({ example: 'Capital-first routing policy' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: ['ROUTING', 'ARBITRATION', 'MERGE', 'EXECUTION'],
    description: 'Policy domain. Defaults to ROUTING.',
  })
  @IsOptional()
  @IsString()
  policyType?: 'ROUTING' | 'ARBITRATION' | 'MERGE' | 'EXECUTION';

  @ApiPropertyOptional({ enum: MetaRouteTarget, description: 'For routing policies.' })
  @IsOptional()
  @IsEnum(MetaRouteTarget)
  target?: MetaRouteTarget;

  @ApiPropertyOptional({ enum: MetaArbitrationType, description: 'For arbitration policies.' })
  @IsOptional()
  @IsEnum(MetaArbitrationType)
  arbitrationType?: MetaArbitrationType;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export class ListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Cursor id for pagination.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
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
