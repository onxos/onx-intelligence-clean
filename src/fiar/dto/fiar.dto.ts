import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FIARAssetClass, FIAROwnershipKind, FIARRelationshipKind } from '@prisma/client';
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
import { FiarLifecycleTransition } from '../fiar.constants';

// ---------------------------------------------------------------------------
// Part A / C — asset registration
// ---------------------------------------------------------------------------

export class RegisterAssetDto {
  @ApiProperty({ example: 'Institutional flourishing profile v2' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: FIARAssetClass })
  @IsEnum(FIARAssetClass)
  assetClass: FIARAssetClass;

  @ApiPropertyOptional({ description: 'Owner user id. Defaults to authenticated actor.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ enum: FIAROwnershipKind, default: 'WORKSPACE' })
  @IsOptional()
  @IsEnum(FIAROwnershipKind)
  ownershipKind?: FIAROwnershipKind;

  @ApiPropertyOptional({
    description: 'Cross-runtime reference id (D16/FIC/IFC/etc.), by value only.',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Cross-runtime reference type, e.g. IFCProfile.' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Optional category code to classify under.' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part B / C — classification
// ---------------------------------------------------------------------------

export class ClassifyAssetDto {
  @ApiProperty({ enum: FIARAssetClass })
  @IsEnum(FIARAssetClass)
  assetClass: FIARAssetClass;

  @ApiPropertyOptional({ description: 'Category to classify the asset under.' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rationale?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part C — ownership
// ---------------------------------------------------------------------------

export class AssignOwnershipDto {
  @ApiProperty({ description: 'The user id that owns the asset.' })
  @IsString()
  @MinLength(1)
  ownerId: string;

  @ApiPropertyOptional({ enum: FIAROwnershipKind, default: 'WORKSPACE' })
  @IsOptional()
  @IsEnum(FIAROwnershipKind)
  ownershipKind?: FIAROwnershipKind;

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
// Part C — relationships (dependency graph)
// ---------------------------------------------------------------------------

export class CreateRelationshipDto {
  @ApiProperty({ description: 'The target asset id this asset relates to.' })
  @IsString()
  @MinLength(1)
  targetAssetId: string;

  @ApiProperty({ enum: FIARRelationshipKind })
  @IsEnum(FIARRelationshipKind)
  kind: FIARRelationshipKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rationale?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part D — lifecycle
// ---------------------------------------------------------------------------

export class LifecycleTransitionDto {
  @ApiProperty({ enum: FiarLifecycleTransition })
  @IsEnum(FiarLifecycleTransition)
  transition: FiarLifecycleTransition;

  @ApiPropertyOptional({ description: 'Replacement asset id (required for REPLACE).' })
  @IsOptional()
  @IsString()
  replacementAssetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part B — categories
// ---------------------------------------------------------------------------

export class CreateCategoryDto {
  @ApiProperty({ example: 'Institutional flourishing capital' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'ifc-capital' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: FIARAssetClass })
  @IsOptional()
  @IsEnum(FIARAssetClass)
  assetClass?: FIARAssetClass;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part F — policy + override
// ---------------------------------------------------------------------------

export class CreatePolicyDto {
  @ApiProperty({ example: 'Strategic asset governance floor' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  requireOwnership?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  requireReference?: boolean;

  @ApiPropertyOptional({
    description: 'Allow-listed asset classes; empty means all are permitted.',
    type: [String],
  })
  @IsOptional()
  allowedClasses?: FIARAssetClass[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}

export class OverrideDto {
  @ApiProperty({ example: 'Founder override: freeze asset pending constitutional review' })
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

export class ListAssetsQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FIARAssetClass })
  @IsOptional()
  @IsEnum(FIARAssetClass)
  assetClass?: FIARAssetClass;
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
