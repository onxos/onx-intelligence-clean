import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuthorityLevel,
  FeedShadowMode,
  FeedStage,
  OwnershipClass,
  SourceCategory,
  SourceStatus,
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
import { FEED_SORT_FIELDS, SOURCE_SORT_FIELDS } from '../intelligence-feeding.constants';

export class CreateSourceDto {
  @ApiProperty({ example: 'Clinical Operations Telemetry' })
  @IsString()
  @MinLength(1)
  identity: string;

  @ApiPropertyOptional({ example: 'Streaming operational telemetry source.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: SourceCategory, example: SourceCategory.INTERNAL })
  @IsOptional()
  @IsEnum(SourceCategory)
  category?: SourceCategory;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.OPERATIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authorityLevel?: AuthorityLevel;

  @ApiPropertyOptional({ enum: OwnershipClass, example: OwnershipClass.INSTITUTIONAL })
  @IsOptional()
  @IsEnum(OwnershipClass)
  ownershipClass?: OwnershipClass;

  @ApiPropertyOptional({ example: 0.7, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  trustScore?: number;

  @ApiPropertyOptional({ example: 0.8, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @ApiPropertyOptional({ enum: SourceStatus, example: SourceStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SourceStatus)
  status?: SourceStatus;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateSourceDto {
  @ApiPropertyOptional({ example: 'Updated source identity' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  identity?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: SourceCategory, example: SourceCategory.EXTERNAL })
  @IsOptional()
  @IsEnum(SourceCategory)
  category?: SourceCategory;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.INSTITUTIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authorityLevel?: AuthorityLevel;

  @ApiPropertyOptional({ example: 0.9, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  trustScore?: number;

  @ApiPropertyOptional({ example: 0.9, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @ApiPropertyOptional({ enum: SourceStatus, example: SourceStatus.SUSPENDED })
  @IsOptional()
  @IsEnum(SourceStatus)
  status?: SourceStatus;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SourceListQueryDto {
  @ApiPropertyOptional({ example: 'telemetry' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SourceCategory, example: SourceCategory.INTERNAL })
  @IsOptional()
  @IsEnum(SourceCategory)
  category?: SourceCategory;

  @ApiPropertyOptional({ enum: SourceStatus, example: SourceStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SourceStatus)
  status?: SourceStatus;

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

  @ApiPropertyOptional({ enum: SOURCE_SORT_FIELDS, example: 'createdAt' })
  @IsOptional()
  @IsIn(SOURCE_SORT_FIELDS)
  sortBy?: (typeof SOURCE_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class IngestFeedDto {
  @ApiProperty({ description: 'Registered intelligence source id.' })
  @IsString()
  @MinLength(1)
  sourceId: string;

  @ApiProperty({ example: 'Raw payload received from the source.' })
  @IsString()
  @MinLength(1)
  payload: string;

  @ApiPropertyOptional({ enum: FeedShadowMode, example: FeedShadowMode.ACTIVE })
  @IsOptional()
  @IsEnum(FeedShadowMode)
  shadowMode?: FeedShadowMode;

  @ApiPropertyOptional({ example: 0.7, minimum: 0, maximum: 1 })
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
  provenanceScore?: number;

  @ApiPropertyOptional({ example: 0.6, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  verificationScore?: number;

  @ApiPropertyOptional({ example: 'KNOWLEDGE' })
  @IsOptional()
  @IsString()
  classification?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AdvanceFeedDto {
  @ApiProperty({ enum: FeedStage, example: FeedStage.NORMALIZED })
  @IsEnum(FeedStage)
  toStage: FeedStage;

  @ApiPropertyOptional({ example: 'KNOWLEDGE' })
  @IsOptional()
  @IsString()
  classification?: string;

  @ApiPropertyOptional({ description: 'Object id to link when entering LINKED.' })
  @IsOptional()
  @IsString()
  linkedObjectId?: string;

  @ApiPropertyOptional({ example: 'Failed authority validation.' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ example: 'Normalised against canonical schema.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class FeedListQueryDto {
  @ApiPropertyOptional({ example: 'payload' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FeedStage, example: FeedStage.RECEIVED })
  @IsOptional()
  @IsEnum(FeedStage)
  stage?: FeedStage;

  @ApiPropertyOptional({ enum: FeedShadowMode, example: FeedShadowMode.SHADOW })
  @IsOptional()
  @IsEnum(FeedShadowMode)
  shadowMode?: FeedShadowMode;

  @ApiPropertyOptional({ description: 'Filter by registered source id.' })
  @IsOptional()
  @IsString()
  sourceId?: string;

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

  @ApiPropertyOptional({ enum: FEED_SORT_FIELDS, example: 'createdAt' })
  @IsOptional()
  @IsIn(FEED_SORT_FIELDS)
  sortBy?: (typeof FEED_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class SetShadowModeDto {
  @ApiProperty({ enum: FeedShadowMode, example: FeedShadowMode.SHADOW })
  @IsEnum(FeedShadowMode)
  shadowMode: FeedShadowMode;

  @ApiPropertyOptional({ example: 'Quarantined pending review.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
