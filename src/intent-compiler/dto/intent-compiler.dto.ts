import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FounderIntentConflictSeverity,
  FounderIntentConflictStatus,
  FounderIntentLifecycle,
  FounderIntentPriority,
  FounderIntentRelationType,
  FounderIntentReviewDecision,
  FounderIntentVersionType,
  FounderOverrideType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FIC_CONFLICT_SORT_FIELDS, FIC_INTENT_SORT_FIELDS } from '../intent-compiler.constants';

// ---------------------------------------------------------------------------
// Founder Intent — create / update
// ---------------------------------------------------------------------------

export class CreateFounderIntentDto {
  @ApiProperty({ example: 'Establish sovereign capital allocation discipline' })
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  title: string;

  @ApiProperty({ example: 'All capital allocation must flow through governed FIC directives.' })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiPropertyOptional({ example: 'Prevents ungoverned capital drift across workspaces.' })
  @IsOptional()
  @IsString()
  rationale?: string;

  @ApiProperty({
    example: 'FOUNDER',
    description: 'Constitutional authority basis for the intent.',
  })
  @IsString()
  @MinLength(1)
  constitutionalAuthority: string;

  @ApiPropertyOptional({ enum: FounderIntentPriority, example: FounderIntentPriority.HIGH })
  @IsOptional()
  @IsEnum(FounderIntentPriority)
  priority?: FounderIntentPriority;

  @ApiPropertyOptional({ description: 'Owner user id. Defaults to authenticated actor.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Intent ids this intent depends on.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({ type: [String], example: ['CAPITAL', 'GOVERNANCE'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedDomains?: string[];

  @ApiPropertyOptional({ description: 'Parent intent id for refinement lineage.' })
  @IsOptional()
  @IsString()
  parentIntentId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateFounderIntentDto {
  @ApiPropertyOptional({ example: 'Updated intent title' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional({ example: 'Updated rationale' })
  @IsOptional()
  @IsString()
  rationale?: string;

  @ApiPropertyOptional({ example: 'INSTITUTIONAL' })
  @IsOptional()
  @IsString()
  constitutionalAuthority?: string;

  @ApiPropertyOptional({ enum: FounderIntentPriority })
  @IsOptional()
  @IsEnum(FounderIntentPriority)
  priority?: FounderIntentPriority;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedDomains?: string[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    enum: FounderIntentVersionType,
    default: FounderIntentVersionType.REVISION,
    description: 'Version bump applied to the persisted change.',
  })
  @IsOptional()
  @IsEnum(FounderIntentVersionType)
  versionType?: FounderIntentVersionType;

  @ApiPropertyOptional({ example: 'Clarified governance routing.' })
  @IsOptional()
  @IsString()
  changeSummary?: string;
}

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

export class VersionFounderIntentDto {
  @ApiProperty({ enum: FounderIntentVersionType, example: FounderIntentVersionType.MINOR })
  @IsEnum(FounderIntentVersionType)
  versionType: FounderIntentVersionType;

  @ApiPropertyOptional({ example: 'Snapshot taken before strategic pivot.' })
  @IsOptional()
  @IsString()
  changeSummary?: string;
}

export class CompareVersionsQueryDto {
  @ApiProperty({ example: 1, description: 'Base version number.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  from: number;

  @ApiProperty({ example: 2, description: 'Target version number.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  to: number;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export class TransitionLifecycleDto {
  @ApiProperty({ enum: FounderIntentLifecycle, example: FounderIntentLifecycle.SUBMITTED })
  @IsEnum(FounderIntentLifecycle)
  to: FounderIntentLifecycle;

  @ApiPropertyOptional({ example: 'Ready for constitutional review.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ApproveIntentDto {
  @ApiPropertyOptional({ example: 'Approved under founder sovereign authority.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String], example: ['CONSTITUTION#4.2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constitutionalReferences?: string[];
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export class CreateRelationshipDto {
  @ApiProperty({ description: 'Target intent id.' })
  @IsString()
  @MinLength(1)
  targetIntentId: string;

  @ApiProperty({ enum: FounderIntentRelationType, example: FounderIntentRelationType.DEPENDS_ON })
  @IsEnum(FounderIntentRelationType)
  relationType: FounderIntentRelationType;

  @ApiPropertyOptional({ example: 'Blocks until governance review completes.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export class CreateReviewDto {
  @ApiProperty({ enum: FounderIntentReviewDecision, example: FounderIntentReviewDecision.APPROVED })
  @IsEnum(FounderIntentReviewDecision)
  decision: FounderIntentReviewDecision;

  @ApiPropertyOptional({ type: [String], example: ['CONSTITUTION#2.1', 'V1_CONSTITUTIONAL_SEAL'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constitutionalReferences?: string[];

  @ApiPropertyOptional({ example: 'Aligned with sovereignty constraints.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Override
// ---------------------------------------------------------------------------

export class OverrideIntentDto {
  @ApiProperty({ enum: FounderOverrideType, example: FounderOverrideType.PRIORITY })
  @IsEnum(FounderOverrideType)
  overrideType: FounderOverrideType;

  @ApiProperty({ example: 'Founder directive supersedes operational scheduling.' })
  @IsString()
  @MinLength(1)
  reason: string;

  @ApiPropertyOptional({
    enum: FounderIntentPriority,
    description: 'New priority (PRIORITY override).',
  })
  @IsOptional()
  @IsEnum(FounderIntentPriority)
  priority?: FounderIntentPriority;

  @ApiPropertyOptional({ description: 'New owner id (OWNERSHIP override).' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ type: [String], description: 'New dependency set (DEPENDENCY override).' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({
    enum: FounderIntentLifecycle,
    description: 'New lifecycle/status (STATUS override).',
  })
  @IsOptional()
  @IsEnum(FounderIntentLifecycle)
  lifecycle?: FounderIntentLifecycle;

  @ApiPropertyOptional({
    description: 'New constitutional authority routing (CONSTITUTIONAL_ROUTING override).',
  })
  @IsOptional()
  @IsString()
  constitutionalAuthority?: string;
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

export class ResolveConflictDto {
  @ApiProperty({ enum: FounderIntentConflictStatus, example: FounderIntentConflictStatus.RESOLVED })
  @IsEnum(FounderIntentConflictStatus)
  status: FounderIntentConflictStatus;

  @ApiPropertyOptional({ example: 'Founder accepted the recommended resolution.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConflictListQueryDto {
  @ApiPropertyOptional({ enum: FounderIntentConflictStatus })
  @IsOptional()
  @IsEnum(FounderIntentConflictStatus)
  status?: FounderIntentConflictStatus;

  @ApiPropertyOptional({ enum: FounderIntentConflictSeverity })
  @IsOptional()
  @IsEnum(FounderIntentConflictSeverity)
  severity?: FounderIntentConflictSeverity;

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
  pageSize?: number;

  @ApiPropertyOptional({ enum: FIC_CONFLICT_SORT_FIELDS as unknown as string[] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export class FounderIntentListQueryDto {
  @ApiPropertyOptional({ example: 'capital' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FounderIntentLifecycle })
  @IsOptional()
  @IsEnum(FounderIntentLifecycle)
  lifecycle?: FounderIntentLifecycle;

  @ApiPropertyOptional({ enum: FounderIntentPriority })
  @IsOptional()
  @IsEnum(FounderIntentPriority)
  priority?: FounderIntentPriority;

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
  pageSize?: number;

  @ApiPropertyOptional({ enum: FIC_INTENT_SORT_FIELDS as unknown as string[] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
