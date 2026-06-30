import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuthorityLevel,
  CapitalCategory,
  IntelligenceLifecycleState,
  IntelligenceObjectType,
  IntelligenceRelationshipType,
  OwnershipClass,
  PrivacyLevel,
  ProvenanceVerificationStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { SORT_FIELDS } from '../intelligence-object.constants';

export class CreateIntelligenceObjectDto {
  @ApiProperty({ example: 'Q3 Capital Efficiency Intent' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'Canonical content / payload for the intelligence object.' })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiProperty({ enum: IntelligenceObjectType, example: IntelligenceObjectType.KNOWLEDGE })
  @IsEnum(IntelligenceObjectType)
  objectType: IntelligenceObjectType;

  @ApiPropertyOptional({ example: 'Operator-facing semantic summary.' })
  @IsOptional()
  @IsString()
  semanticSummary?: string;

  @ApiPropertyOptional({
    enum: IntelligenceLifecycleState,
    example: IntelligenceLifecycleState.DRAFT,
  })
  @IsOptional()
  @IsEnum(IntelligenceLifecycleState)
  lifecycleState?: IntelligenceLifecycleState;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.OPERATIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authorityLevel?: AuthorityLevel;

  @ApiPropertyOptional({ enum: OwnershipClass, example: OwnershipClass.INSTITUTIONAL })
  @IsOptional()
  @IsEnum(OwnershipClass)
  ownershipClass?: OwnershipClass;

  @ApiPropertyOptional({ enum: PrivacyLevel, example: PrivacyLevel.INSTITUTIONAL })
  @IsOptional()
  @IsEnum(PrivacyLevel)
  privacyLevel?: PrivacyLevel;

  @ApiPropertyOptional({ enum: CapitalCategory, example: CapitalCategory.KNOWLEDGE })
  @IsOptional()
  @IsEnum(CapitalCategory)
  capitalCategory?: CapitalCategory;

  @ApiPropertyOptional({ example: 0.72, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  trustScore?: number;

  @ApiPropertyOptional({ example: 0.81, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @ApiPropertyOptional({ example: 0.6, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  amanahScore?: number;

  @ApiPropertyOptional({ example: 0.77, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  qualityIndex?: number;
}

export class UpdateIntelligenceObjectDto {
  @ApiPropertyOptional({ example: 'Updated object name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated object content' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional({ enum: IntelligenceObjectType, example: IntelligenceObjectType.EVIDENCE })
  @IsOptional()
  @IsEnum(IntelligenceObjectType)
  objectType?: IntelligenceObjectType;

  @ApiPropertyOptional({ example: 'Updated semantic summary' })
  @IsOptional()
  @IsString()
  semanticSummary?: string;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.INSTITUTIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authorityLevel?: AuthorityLevel;

  @ApiPropertyOptional({ enum: PrivacyLevel, example: PrivacyLevel.CONFIDENTIAL })
  @IsOptional()
  @IsEnum(PrivacyLevel)
  privacyLevel?: PrivacyLevel;

  @ApiPropertyOptional({ enum: CapitalCategory, example: CapitalCategory.STRATEGY })
  @IsOptional()
  @IsEnum(CapitalCategory)
  capitalCategory?: CapitalCategory;

  @ApiPropertyOptional({ example: 0.9, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  trustScore?: number;

  @ApiPropertyOptional({ example: 0.88, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @ApiPropertyOptional({ example: 0.86, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  qualityIndex?: number;
}

export class IntelligenceObjectListQueryDto {
  @ApiPropertyOptional({ description: 'Free text search across key fields.', example: 'capital' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: IntelligenceObjectType, example: IntelligenceObjectType.KNOWLEDGE })
  @IsOptional()
  @IsEnum(IntelligenceObjectType)
  type?: IntelligenceObjectType;

  @ApiPropertyOptional({
    enum: IntelligenceLifecycleState,
    example: IntelligenceLifecycleState.ACTIVE,
  })
  @IsOptional()
  @IsEnum(IntelligenceLifecycleState)
  lifecycleState?: IntelligenceLifecycleState;

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
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ enum: SORT_FIELDS, example: 'createdAt' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: (typeof SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class CreateRelationshipDto {
  @ApiProperty({ description: 'Target intelligence object id in the same workspace.' })
  @IsString()
  @MinLength(1)
  targetObjectId: string;

  @ApiProperty({
    enum: IntelligenceRelationshipType,
    example: IntelligenceRelationshipType.DERIVES_FROM,
  })
  @IsEnum(IntelligenceRelationshipType)
  relationshipType: IntelligenceRelationshipType;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class LifecycleTransitionDto {
  @ApiProperty({ enum: IntelligenceLifecycleState, example: IntelligenceLifecycleState.INGESTED })
  @IsEnum(IntelligenceLifecycleState)
  toState: IntelligenceLifecycleState;

  @ApiPropertyOptional({ example: 'Validated against source corpus.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateProvenanceDto {
  @ApiProperty({ example: 'src-corpus-7781' })
  @IsString()
  @MinLength(1)
  sourceIdentity: string;

  @ApiProperty({ example: 'L2_SIL' })
  @IsString()
  @MinLength(1)
  origin: string;

  @ApiProperty({ example: 'founder-intent-engine' })
  @IsString()
  @MinLength(1)
  creator: string;

  @ApiProperty({ example: 'structured-extraction' })
  @IsString()
  @MinLength(1)
  extractionMethod: string;

  @ApiPropertyOptional({
    enum: ProvenanceVerificationStatus,
    example: ProvenanceVerificationStatus.VERIFIED,
  })
  @IsOptional()
  @IsEnum(ProvenanceVerificationStatus)
  verificationStatus?: ProvenanceVerificationStatus;

  @ApiPropertyOptional({ example: 0.84, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.INSTITUTIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authorityLevel?: AuthorityLevel;
}
