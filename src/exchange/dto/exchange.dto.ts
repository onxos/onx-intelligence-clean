import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthorityLevel, ExchangeMessageType, ExchangeOwnershipClass } from '@prisma/client';
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
import { EXCHANGE_SORT_FIELDS } from '../exchange.constants';

// ---------------------------------------------------------------------------
// Exchange session — create / update
// ---------------------------------------------------------------------------

export class CreateExchangeSessionDto {
  @ApiProperty({ example: 'Knowledge exchange channel' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Exchange session for cross-domain intelligence transfer.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Owner user id. Defaults to authenticated actor.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ enum: ExchangeOwnershipClass, example: ExchangeOwnershipClass.WORKSPACE })
  @IsOptional()
  @IsEnum(ExchangeOwnershipClass)
  ownershipClass?: ExchangeOwnershipClass;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.OPERATIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authority?: AuthorityLevel;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateExchangeSessionDto {
  @ApiPropertyOptional({ example: 'Updated exchange name' })
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
// Exchange transaction — create (Part A/C/D/E)
// ---------------------------------------------------------------------------

export class CreateExchangeDto {
  @ApiProperty({ description: 'Exchange session id the transaction belongs to.' })
  @IsString()
  @MinLength(1)
  sessionId: string;

  @ApiProperty({ example: 'Transfer validated learning to capital ledger' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  intent: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ExchangeOwnershipClass, example: ExchangeOwnershipClass.KNOWLEDGE })
  @IsOptional()
  @IsEnum(ExchangeOwnershipClass)
  ownershipClass?: ExchangeOwnershipClass;

  @ApiPropertyOptional({ enum: AuthorityLevel, example: AuthorityLevel.OPERATIONAL })
  @IsOptional()
  @IsEnum(AuthorityLevel)
  authority?: AuthorityLevel;

  @ApiPropertyOptional({ description: 'Lineage origin (e.g. producing domain/entity).' })
  @IsOptional()
  @IsString()
  origin?: string;

  @ApiPropertyOptional({ description: 'Lineage destination (e.g. consuming domain/entity).' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ description: 'Parent exchange transaction id for chained exchanges.' })
  @IsOptional()
  @IsString()
  parentTransactionId?: string;

  @ApiPropertyOptional({ description: 'Source object id (D11/D12/D13/D16/D17/D18/IUC).' })
  @IsOptional()
  @IsString()
  sourceObjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceObjectType?: string;

  @ApiPropertyOptional({ description: 'Target object id (destination domain entity).' })
  @IsOptional()
  @IsString()
  targetObjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetObjectType?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, example: 0.9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ description: 'Provenance reference (evidence/source).' })
  @IsOptional()
  @IsString()
  provenance?: string;

  @ApiPropertyOptional({
    description: 'Whether the exchange must remain traceable.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  traceable?: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Exchange payload to seal.',
  })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SubmitExchangeDto {
  @ApiPropertyOptional({ example: 'Submit for constitutional exchange execution' })
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
// Message (Part A)
// ---------------------------------------------------------------------------

export class RecordExchangeMessageDto {
  @ApiProperty({ enum: ExchangeMessageType, example: ExchangeMessageType.EVENT })
  @IsEnum(ExchangeMessageType)
  messageType: ExchangeMessageType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromParty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toParty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

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
// Replay / rollback (Part G)
// ---------------------------------------------------------------------------

export class ReplayExchangeDto {
  @ApiPropertyOptional({ example: 'Replay after downstream retry' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RollbackExchangeDto {
  @ApiPropertyOptional({ example: 'Rollback due to failed downstream verification' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ValidateExchangeDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Policy (Part G)
// ---------------------------------------------------------------------------

export class CreateExchangePolicyDto {
  @ApiProperty({ example: 'trust-floor' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'TRUST' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  policyType: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
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
// Queries
// ---------------------------------------------------------------------------

export class ExchangeListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ enum: EXCHANGE_SORT_FIELDS })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class ExchangeStreamQueryDto {
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
