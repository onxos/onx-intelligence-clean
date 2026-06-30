import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthorityLevel, UnderstandingRelationType, UnderstandingStateType } from '@prisma/client';
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
import { IUC_SORT_FIELDS } from '../iuc.constants';

// ---------------------------------------------------------------------------
// IUC entity — create / update
// ---------------------------------------------------------------------------

export class CreateIUCDto {
  @ApiProperty({ example: 'Understanding of sovereign capital governance' })
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  title: string;

  @ApiPropertyOptional({ example: 'The institution understands how capital is governed.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'CAPITAL' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  domain?: string;

  @ApiPropertyOptional({ description: 'Owner user id. Defaults to authenticated actor.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ example: 0, description: 'Initial progress (0-1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  progress?: number;

  @ApiPropertyOptional({ example: 0, description: 'Initial confidence (0-1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.OPERATIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authority?: AuthorityLevel;

  @ApiPropertyOptional({ description: 'Linked intelligence capital id.' })
  @IsOptional()
  @IsString()
  capitalId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateIUCDto {
  @ApiPropertyOptional({ example: 'Updated title' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'GOVERNANCE' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  domain?: string;

  @ApiPropertyOptional({ enum: AuthorityLevel })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authority?: AuthorityLevel;

  @ApiPropertyOptional({ description: 'Linked intelligence capital id.' })
  @IsOptional()
  @IsString()
  capitalId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State / progress / confidence / evolution
// ---------------------------------------------------------------------------

export class TransitionUnderstandingStateDto {
  @ApiProperty({ enum: UnderstandingStateType, example: UnderstandingStateType.DEVELOPING })
  @IsEnum(UnderstandingStateType)
  state: UnderstandingStateType;

  @ApiPropertyOptional({ example: 'Sufficient evidence has accumulated to advance.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateProgressDto {
  @ApiProperty({ example: 0.5, description: 'New progress value (0-1).' })
  @IsNumber()
  @Min(0)
  @Max(1)
  progress: number;

  @ApiPropertyOptional({ example: 'Completed second validation milestone.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateConfidenceDto {
  @ApiProperty({ example: 0.7, description: 'New confidence value (0-1).' })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @ApiPropertyOptional({ example: 'Confirmed by independent evidence.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class EvolveUnderstandingDto {
  @ApiPropertyOptional({ example: 0.4, description: 'Progress to set on evolution (0-1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  progress?: number;

  @ApiPropertyOptional({ example: 0.4, description: 'Confidence to set on evolution (0-1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiProperty({ example: 'Underlying assumptions changed; understanding must evolve.' })
  @IsString()
  @MinLength(1)
  reason: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Evidence + relationships
// ---------------------------------------------------------------------------

export class AddUnderstandingEvidenceDto {
  @ApiProperty({ example: 'Capital governance audit log confirms enforcement.' })
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

  @ApiPropertyOptional({ example: 1, description: 'Evidence weight.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateUnderstandingRelationshipDto {
  @ApiProperty({ description: 'Target IUC entity id.' })
  @IsString()
  @MinLength(1)
  targetIucId: string;

  @ApiProperty({ enum: UnderstandingRelationType, example: UnderstandingRelationType.DEPENDS_ON })
  @IsEnum(UnderstandingRelationType)
  relationType: UnderstandingRelationType;

  @ApiPropertyOptional({ example: 'Governance understanding depends on capital understanding.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export class IUCListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UnderstandingStateType })
  @IsOptional()
  @IsEnum(UnderstandingStateType)
  state?: UnderstandingStateType;

  @ApiPropertyOptional({ example: 'CAPITAL' })
  @IsOptional()
  @IsString()
  domain?: string;

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

  @ApiPropertyOptional({ enum: IUC_SORT_FIELDS })
  @IsOptional()
  @IsString()
  sortBy?: (typeof IUC_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
