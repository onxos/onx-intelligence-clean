import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StrategicHorizon, StrategicPriority } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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

// ---------------------------------------------------------------------------
// Part A / B — session + strategic interpretation
// ---------------------------------------------------------------------------

export class CreateSessionDto {
  @ApiProperty({ example: 'FY26 strategic intelligence protocol' })
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

  @ApiProperty({ example: 'Establish sovereign intelligence capital advantage' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  founderDirective: string;

  @ApiPropertyOptional({ example: 'Compound intelligence capital across all runtimes' })
  @IsOptional()
  @IsString()
  strategicObjective?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  strategicContext?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  strategicConstraints?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: StrategicPriority })
  @IsOptional()
  @IsEnum(StrategicPriority)
  strategicPriority?: StrategicPriority;

  @ApiPropertyOptional({ enum: StrategicHorizon })
  @IsOptional()
  @IsEnum(StrategicHorizon)
  strategicHorizon?: StrategicHorizon;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  strategicOutcome?: string;

  @ApiPropertyOptional({ description: 'FIC founder intent id this session realizes.' })
  @IsOptional()
  @IsString()
  intentReferenceId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class InterpretDirectiveDto {
  @ApiPropertyOptional({ example: 'Refined founder directive' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  founderDirective?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  strategicObjective?: string;

  @ApiPropertyOptional({ enum: StrategicPriority })
  @IsOptional()
  @IsEnum(StrategicPriority)
  strategicPriority?: StrategicPriority;

  @ApiPropertyOptional({ enum: StrategicHorizon })
  @IsOptional()
  @IsEnum(StrategicHorizon)
  strategicHorizon?: StrategicHorizon;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  strategicOutcome?: string;
}

// ---------------------------------------------------------------------------
// Part A / C — protocol, rules, policies
// ---------------------------------------------------------------------------

export class CreateProtocolDto {
  @ApiProperty({ example: 'Sovereign capital compounding protocol' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: StrategicPriority })
  @IsOptional()
  @IsEnum(StrategicPriority)
  strategicPriority?: StrategicPriority;

  @ApiPropertyOptional({ enum: StrategicHorizon })
  @IsOptional()
  @IsEnum(StrategicHorizon)
  strategicHorizon?: StrategicHorizon;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateRuleDto {
  @ApiProperty({ example: 'Prioritize capital-positive intelligence' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  ordering?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}

export class CreatePolicyDto {
  @ApiProperty({ example: 'Capital-first strategic policy' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ enum: StrategicPriority })
  @IsOptional()
  @IsEnum(StrategicPriority)
  strategicPriority?: StrategicPriority;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Execution + override
// ---------------------------------------------------------------------------

export class ExecuteProtocolDto {
  @ApiPropertyOptional({
    enum: StrategicPriority,
    description: 'Overrides the protocol priority for this execution.',
  })
  @IsOptional()
  @IsEnum(StrategicPriority)
  strategicPriority?: StrategicPriority;

  @ApiPropertyOptional({ enum: StrategicHorizon })
  @IsOptional()
  @IsEnum(StrategicHorizon)
  strategicHorizon?: StrategicHorizon;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class OverrideDto {
  @ApiProperty({ example: 'Founder halts protocol under sovereign authority' })
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
  constitutionalRef?: string;

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
