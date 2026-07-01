import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IFCComponentStatus, IFCDimensionKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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
} from 'class-validator';

// ---------------------------------------------------------------------------
// Part A — profile
// ---------------------------------------------------------------------------

export class CreateProfileDto {
  @ApiProperty({ example: 'ONX institutional flourishing profile' })
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

  @ApiPropertyOptional({ description: 'FIC founder intent id this profile aligns to.' })
  @IsOptional()
  @IsString()
  intentReferenceId?: string;

  @ApiPropertyOptional({ description: 'USFIP/strategic objective reference.' })
  @IsOptional()
  @IsString()
  objectiveReference?: string;

  @ApiPropertyOptional({
    description: 'Seed the eight canonical flourishing dimensions. Defaults to true.',
  })
  @IsOptional()
  @IsBoolean()
  seedDimensions?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateProfileDto {
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
  intentReferenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objectiveReference?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part B — dimensions
// ---------------------------------------------------------------------------

export class CreateDimensionDto {
  @ApiProperty({ enum: IFCDimensionKind })
  @IsEnum(IFCDimensionKind)
  kind: IFCDimensionKind;

  @ApiPropertyOptional({ example: 'Knowledge flourishing' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, example: 0.125 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateDimensionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;

  @ApiPropertyOptional({ enum: IFCComponentStatus })
  @IsOptional()
  @IsEnum(IFCComponentStatus)
  status?: IFCComponentStatus;
}

export class RecordIndicatorDto {
  @ApiProperty({ enum: IFCDimensionKind, description: 'Dimension the indicator belongs to.' })
  @IsEnum(IFCDimensionKind)
  kind: IFCDimensionKind;

  @ApiProperty({ example: 'Knowledge object coverage' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ minimum: 0, maximum: 1, example: 0.8 })
  @IsNumber()
  @Min(0)
  @Max(1)
  value: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, example: 0.9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ description: 'Cross-domain reference id (D16/D17/etc.), by value only.' })
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
// Part C — scoring
// ---------------------------------------------------------------------------

export class CalculateScoreDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part D — capitalization signal
// ---------------------------------------------------------------------------

export class CapitalizationSignalDto {
  @ApiPropertyOptional({ description: 'D13 intelligence-capital reference, by value only.' })
  @IsOptional()
  @IsString()
  capitalReference?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part F — policy + override
// ---------------------------------------------------------------------------

export class CreatePolicyDto {
  @ApiProperty({ example: 'Institutional flourishing floor' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minIndex?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, example: 0.4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 0, example: -0.1 })
  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(0)
  degradationDelta?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}

export class OverrideDto {
  @ApiProperty({ example: 'Founder override: freeze flourishing profile under review' })
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

export class ListQueryDto {
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
