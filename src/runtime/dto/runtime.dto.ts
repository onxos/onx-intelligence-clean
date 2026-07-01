import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuthorityLevel,
  RuntimeCheckpointType,
  RuntimeContextType,
  RuntimeEventType,
  RuntimeRecoveryType,
  RuntimeSessionState,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RUNTIME_SORT_FIELDS } from '../runtime.constants';

// ---------------------------------------------------------------------------
// Session — create / update
// ---------------------------------------------------------------------------

export class CreateRuntimeSessionDto {
  @ApiProperty({ example: 'Sovereign execution runtime' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Runtime session for the intelligence execution loop.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Owner user id. Defaults to authenticated actor.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.OPERATIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authority?: AuthorityLevel;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateRuntimeSessionDto {
  @ApiPropertyOptional({ example: 'Updated runtime name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

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
// State transition
// ---------------------------------------------------------------------------

export class TransitionRuntimeStateDto {
  @ApiProperty({ enum: RuntimeSessionState, example: RuntimeSessionState.RUNNING })
  @IsEnum(RuntimeSessionState)
  state: RuntimeSessionState;

  @ApiPropertyOptional({ example: 'Execution started by directive ONX-IW09-001' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Context (Part C — runtime objects)
// ---------------------------------------------------------------------------

export class AttachRuntimeContextDto {
  @ApiProperty({ enum: RuntimeContextType, example: RuntimeContextType.EXECUTION })
  @IsEnum(RuntimeContextType)
  contextType: RuntimeContextType;

  @ApiProperty({ example: 'primary-execution' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  key: string;

  @ApiPropertyOptional({ description: 'External domain entity id (D11/D12/D13/D16/D17/IUC/FIC).' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'External domain entity type name.' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export class RecordRuntimeEventDto {
  @ApiProperty({ enum: RuntimeEventType, example: RuntimeEventType.HEARTBEAT })
  @IsEnum(RuntimeEventType)
  eventType: RuntimeEventType;

  @ApiPropertyOptional({ example: 'Heartbeat from executor node.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

export class CreateRuntimeCheckpointDto {
  @ApiProperty({ example: 'Pre-migration checkpoint' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @ApiPropertyOptional({ enum: RuntimeCheckpointType, example: RuntimeCheckpointType.MANUAL })
  @IsOptional()
  @IsEnum(RuntimeCheckpointType)
  checkpointType?: RuntimeCheckpointType;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export class RecoverRuntimeDto {
  @ApiProperty({ enum: RuntimeRecoveryType, example: RuntimeRecoveryType.CHECKPOINT_RESTORE })
  @IsEnum(RuntimeRecoveryType)
  recoveryType: RuntimeRecoveryType;

  @ApiPropertyOptional({
    description: 'Checkpoint id to restore from (required for restore/rollback).',
  })
  @IsOptional()
  @IsString()
  checkpointId?: string;

  @ApiPropertyOptional({ example: 'Recovering after executor crash.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RestoreCheckpointDto {
  @ApiPropertyOptional({ example: 'Restoring known-good runtime.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Policy (Part F — governance)
// ---------------------------------------------------------------------------

export class CreateRuntimePolicyDto {
  @ApiProperty({ example: 'Auto-checkpoint policy' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'CHECKPOINT' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  policyType: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

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
// Query DTOs
// ---------------------------------------------------------------------------

export class RuntimeListQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search on name/description.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: RuntimeSessionState })
  @IsOptional()
  @IsEnum(RuntimeSessionState)
  state?: RuntimeSessionState;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ enum: RUNTIME_SORT_FIELDS as unknown as string[] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class RuntimeStreamQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
