import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CertificationGate,
  ContradictionType,
  FailureInjectionType,
  ProofScenarioGroup,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
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
  ValidateNested,
} from 'class-validator';

// ---------------------------------------------------------------------------
// Proof session (Part A)
// ---------------------------------------------------------------------------

export class CreateProofSessionDto {
  @ApiProperty({ example: 'Constitutional verification run' })
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

  @ApiPropertyOptional({ example: 'full-system' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ example: 'EXCHANGE' })
  @IsOptional()
  @IsString()
  targetDomain?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateProofSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateProofScenarioDto {
  @ApiProperty({ example: 'Exchange integrity replay' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ProofScenarioGroup, example: ProofScenarioGroup.EXCHANGE })
  @IsEnum(ProofScenarioGroup)
  group: ProofScenarioGroup;

  @ApiPropertyOptional({ enum: CertificationGate })
  @IsOptional()
  @IsEnum(CertificationGate)
  gate?: CertificationGate;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  expectation?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  repeatable?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Certification gate signals (Part C) — optional observed/violation overrides
// ---------------------------------------------------------------------------

export class GateSignalsDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) knowledgeObjects?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) knowledgeViolations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) memoryEntries?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) memoryViolations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) runtimeSessions?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) runtimeViolations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) exchangeTransactions?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) exchangeViolations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) capitalAllocations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) capitalViolations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) measurements?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) measurementViolations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) governancePolicies?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) governanceViolations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) auditRecords?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) auditViolations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) evidenceRecords?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) evidenceViolations?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) securityControls?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) securityViolations?: number;
}

export class RunProofDto {
  @ApiPropertyOptional({ description: 'Optional scenario to bind this execution to.' })
  @IsOptional()
  @IsString()
  scenarioId?: string;

  @ApiPropertyOptional({
    enum: CertificationGate,
    description: 'Restrict the run to a single gate. Omit to run all gates.',
  })
  @IsOptional()
  @IsEnum(CertificationGate)
  gate?: CertificationGate;

  @ApiPropertyOptional({ type: GateSignalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GateSignalsDto)
  signals?: GateSignalsDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CertifyProofDto {
  @ApiPropertyOptional({ type: GateSignalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GateSignalsDto)
  signals?: GateSignalsDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Contradiction engine (Part E)
// ---------------------------------------------------------------------------

export class ContradictionCandidateDto {
  @ApiProperty({ enum: ContradictionType, example: ContradictionType.KNOWLEDGE })
  @IsEnum(ContradictionType)
  type: ContradictionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leftReferenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leftReferenceType?: string;

  @ApiProperty({ description: 'Value asserted by the left source.' })
  leftValue: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rightReferenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rightReferenceType?: string;

  @ApiProperty({ description: 'Value asserted by the right source.' })
  rightValue: unknown;
}

export class DetectContradictionsDto {
  @ApiProperty({ type: [ContradictionCandidateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContradictionCandidateDto)
  candidates: ContradictionCandidateDto[];

  @ApiPropertyOptional({ description: 'Optional proof session to attribute contradictions to.' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stress campaign (Part B) + failure injection (Part D)
// ---------------------------------------------------------------------------

export class CreateStressCampaignDto {
  @ApiProperty({ example: 'Runtime resilience campaign' })
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

  @ApiPropertyOptional({ enum: ProofScenarioGroup })
  @IsOptional()
  @IsEnum(ProofScenarioGroup)
  group?: ProofScenarioGroup;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDomain?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateStressScenarioDto {
  @ApiProperty({ example: 'Runtime interruption under load' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ProofScenarioGroup, example: ProofScenarioGroup.RUNTIME })
  @IsEnum(ProofScenarioGroup)
  group: ProofScenarioGroup;

  @ApiPropertyOptional({ enum: FailureInjectionType })
  @IsOptional()
  @IsEnum(FailureInjectionType)
  injectionType?: FailureInjectionType;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  repeatable?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class InjectionDefensesDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canDetect?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canContain?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canRecover?: boolean;
}

export class InjectionSpecDto {
  @ApiProperty({ enum: FailureInjectionType, example: FailureInjectionType.RUNTIME_INTERRUPTION })
  @IsEnum(FailureInjectionType)
  injectionType: FailureInjectionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetReferenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetReferenceType?: string;

  @ApiPropertyOptional({ type: InjectionDefensesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InjectionDefensesDto)
  defenses?: InjectionDefensesDto;
}

export class RunStressDto {
  @ApiPropertyOptional({ description: 'Optional scenario to bind this execution to.' })
  @IsOptional()
  @IsString()
  scenarioId?: string;

  @ApiPropertyOptional({
    type: [InjectionSpecDto],
    description: 'Injections to run. Omit to run the full canonical injection battery.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InjectionSpecDto)
  injections?: InjectionSpecDto[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class InjectFailureDto {
  @ApiProperty({ enum: FailureInjectionType, example: FailureInjectionType.TRUST_FAILURE })
  @IsEnum(FailureInjectionType)
  injectionType: FailureInjectionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetReferenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetReferenceType?: string;

  @ApiPropertyOptional({ type: InjectionDefensesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InjectionDefensesDto)
  defenses?: InjectionDefensesDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Query DTOs
// ---------------------------------------------------------------------------

export class ProofListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class StreamQueryDto {
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
