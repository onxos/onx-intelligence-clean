import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeploymentEnvironment,
  ImplementationBoundaryKind,
  ImplementationDependencyKind,
  ImplementationUnitKind,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { COMPATIBILITY_LEVELS } from '../d20.constants';

// ---------------------------------------------------------------------------
// Part A — implementation registry
// ---------------------------------------------------------------------------

export class RegisterUnitDto {
  @ApiProperty({ description: 'Human-readable implementation unit name.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Stable unit slug (unique per workspace).' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug: string;

  @ApiProperty({ enum: ImplementationUnitKind })
  @IsEnum(ImplementationUnitKind)
  kind: ImplementationUnitKind;

  @ApiProperty({ description: 'Execution scope of the unit (Part B).' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  executionScope: string;

  @ApiProperty({ description: 'Ownership of the unit (Part B).' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  ownership: string;

  @ApiPropertyOptional({ description: 'Runtime boundary (Part B).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  runtimeBoundary?: string;

  @ApiPropertyOptional({ description: 'Build boundary (Part B).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  buildBoundary?: string;

  @ApiPropertyOptional({ description: 'Deployment boundary (Part B).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deploymentBoundary?: string;

  @ApiPropertyOptional({ description: 'Package slug to attach this unit to.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  packageSlug?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RegisterPackageDto {
  @ApiProperty({ description: 'Human-readable package name.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Stable package slug (unique per workspace).' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug: string;

  @ApiPropertyOptional({ description: 'Package description.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class DeclareDependencyDto {
  @ApiProperty({ description: 'Source unit slug.' })
  @IsString()
  @MinLength(1)
  fromSlug: string;

  @ApiProperty({ description: 'Target unit slug.' })
  @IsString()
  @MinLength(1)
  toSlug: string;

  @ApiPropertyOptional({ enum: ImplementationDependencyKind, default: 'REQUIRED' })
  @IsOptional()
  @IsEnum(ImplementationDependencyKind)
  kind?: ImplementationDependencyKind;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  satisfied?: boolean;

  @ApiPropertyOptional({ description: 'Notes.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class DeclareBoundaryDto {
  @ApiProperty({ enum: ImplementationBoundaryKind })
  @IsEnum(ImplementationBoundaryKind)
  kind: ImplementationBoundaryKind;

  @ApiProperty({ description: 'Boundary scope.' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  scope: string;

  @ApiPropertyOptional({ default: true, description: 'Whether the boundary is permitted.' })
  @IsOptional()
  @IsBoolean()
  allowed?: boolean;

  @ApiPropertyOptional({ description: 'Boundary description.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

// ---------------------------------------------------------------------------
// Part C — build architecture
// ---------------------------------------------------------------------------

export class CompatibilityEntryDto {
  @ApiProperty({ description: 'Reused module name.' })
  @IsString()
  @MinLength(1)
  module: string;

  @ApiProperty({ enum: COMPATIBILITY_LEVELS as unknown as string[] })
  @IsIn(COMPATIBILITY_LEVELS as unknown as string[])
  level: (typeof COMPATIBILITY_LEVELS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateBuildProfileDto {
  @ApiProperty({ description: 'Build profile name.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Build profile identifier (e.g. production, container).' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  profile: string;

  @ApiPropertyOptional({ description: 'Package slug the build targets.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  packageSlug?: string;

  @ApiPropertyOptional({ type: [String], description: 'Declared build stages.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stages?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Declared build artifacts.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  artifacts?: string[];

  @ApiPropertyOptional({ type: [CompatibilityEntryDto], description: 'Compatibility matrix.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompatibilityEntryDto)
  compatibility?: CompatibilityEntryDto[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  buildMetadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part E — deployment governance
// ---------------------------------------------------------------------------

export class CreateDeploymentProfileDto {
  @ApiProperty({ description: 'Deployment profile name.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: DeploymentEnvironment })
  @IsEnum(DeploymentEnvironment)
  environment: DeploymentEnvironment;

  @ApiPropertyOptional({ description: 'Build profile business id the deployment references.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  buildProfileRef?: string;

  @ApiPropertyOptional({ type: Object, description: 'Rollback metadata (Part E).' })
  @IsOptional()
  @IsObject()
  rollbackMetadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Override + queries
// ---------------------------------------------------------------------------

export class OverrideUnitDto {
  @ApiProperty({ description: 'Founder directive for the override.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  directive: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  constitutionalRef?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListUnitsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor (unit id).' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: ImplementationUnitKind })
  @IsOptional()
  @IsEnum(ImplementationUnitKind)
  kind?: ImplementationUnitKind;

  @ApiPropertyOptional({ description: 'Filter by name substring.' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ListProfilesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor (id).' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
