import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class IntentPriorityDto {
  @ApiProperty({
    description: 'Priority area to emphasize during execution planning.',
    example: 'evidence-quality',
  })
  @IsString()
  @IsNotEmpty()
  area: string;

  @ApiProperty({
    description: 'Relative importance weight (1..100).',
    example: 90,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  weight: number;

  @ApiPropertyOptional({
    description: 'Optional human rationale explaining this priority.',
    example: 'Market readiness depends on fast evidence throughput.',
  })
  @IsOptional()
  @IsString()
  rationale?: string;
}

export class FounderIntentInputDto {
  @ApiProperty({
    description: 'Founder objective to compile into execution directives.',
    example: 'Scale the knowledge ingestion and validation pipeline within one quarter.',
  })
  @IsString()
  @IsNotEmpty()
  objective: string;

  @ApiProperty({
    description: 'Constraint statements that must hold during execution.',
    type: [String],
    example: ['must preserve workspace isolation', 'must not exceed approved capital envelope'],
  })
  @IsArray()
  @IsString({ each: true })
  constraints: string[];

  @ApiProperty({
    description: 'Weighted execution priorities.',
    type: [IntentPriorityDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentPriorityDto)
  priorities: IntentPriorityDto[];

  @ApiProperty({
    description: 'Strategic context signals considered by compiler.',
    type: [String],
    example: ['atlas-v6 execution window', 'customer readiness'],
  })
  @IsArray()
  @IsString({ each: true })
  strategicContext: string[];

  @ApiProperty({
    description: 'Governance context constraints and constitutional anchors.',
    type: [String],
    example: ['constitutional additivity only', 'no cross-workspace leakage'],
  })
  @IsArray()
  @IsString({ each: true })
  governanceContext: string[];

  @ApiProperty({
    description: 'Workspace identifier for strict tenant isolation.',
    example: 'ws_alpha001',
  })
  @IsString()
  @IsNotEmpty()
  workspaceId: string;
}

export class FounderIntentCompileDto extends FounderIntentInputDto {}

export class FounderIntentValidateDto extends FounderIntentInputDto {}

export class FounderIntentSimulateDto extends FounderIntentInputDto {}

export class ValidationIssueDto {
  @ApiProperty({ example: 'MISSING_OBJECTIVE' })
  code: string;

  @ApiProperty({ example: 'Objective is required.' })
  message: string;

  @ApiProperty({ example: 'objective' })
  field: string;

  @ApiProperty({ enum: ['ERROR', 'WARNING'], example: 'ERROR' })
  severity: 'ERROR' | 'WARNING';
}

export class DependencySnapshotDto {
  @ApiProperty({ example: 2 })
  projects: number;

  @ApiProperty({ example: 3 })
  agents: number;

  @ApiProperty({ example: 12 })
  memories: number;

  @ApiProperty({ example: 7 })
  sources: number;

  @ApiProperty({ example: 1 })
  evaluations: number;

  @ApiProperty({ example: 4 })
  capitalAllocations: number;
}

export class FounderIntentValidationResultDto {
  @ApiProperty({ example: 'ws_alpha001' })
  workspaceId: string;

  @ApiProperty({ example: true })
  valid: boolean;

  @ApiProperty({ type: [ValidationIssueDto] })
  errors: ValidationIssueDto[];

  @ApiProperty({ type: [ValidationIssueDto] })
  warnings: ValidationIssueDto[];

  @ApiProperty({
    type: DependencySnapshotDto,
    description: 'Observed platform dependency availability for the workspace.',
  })
  dependencies: DependencySnapshotDto;
}

export class FounderIntentCompileResultDto {
  @ApiProperty({ example: 'cmfounderintent123' })
  id: string;

  @ApiProperty({ example: 'ws_alpha001' })
  workspaceId: string;

  @ApiProperty({
    description: 'Normalized founder intent payload.',
    type: Object,
    additionalProperties: true,
  })
  @IsObject()
  normalizedIntent: Record<string, unknown>;

  @ApiProperty({ type: [Object], description: 'Generated execution directives.' })
  executionDirectives: Array<Record<string, unknown>>;

  @ApiProperty({ type: [String], example: ['ws_alpha001'] })
  affectedWorkspaces: string[];

  @ApiProperty({ type: [String], description: 'Workspace project ids touched by directives.' })
  affectedProjects: string[];

  @ApiProperty({ type: [String], description: 'Agent ids required by directives.' })
  requiredAgents: string[];

  @ApiProperty({ type: [String], description: 'Memory ids required by directives.' })
  requiredMemories: string[];

  @ApiProperty({ type: [String], description: 'Source ids required by directives.' })
  requiredSources: string[];

  @ApiProperty({
    description: 'Evaluation constraints inferred from priorities and governance context.',
    type: [String],
  })
  evaluationRequirements: string[];

  @ApiProperty({
    description: 'Execution graph from strategic objective to success criteria.',
    type: Object,
    additionalProperties: true,
  })
  executionGraph: Record<string, unknown>;

  @ApiProperty({
    description: 'Confidence score in range [0,1] based on validation and dependency availability.',
    example: 0.82,
  })
  confidenceScore: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class FounderIntentSimulationResultDto {
  @ApiProperty({ example: 'ws_alpha001' })
  workspaceId: string;

  @ApiProperty({ type: [Object], description: 'Execution sequence as stage-by-stage steps.' })
  executionSequence: Array<Record<string, unknown>>;

  @ApiProperty({ type: [String], description: 'Dependency order for execution prerequisites.' })
  dependencyOrder: string[];

  @ApiProperty({ type: [String], description: 'Estimated execution stages.' })
  estimatedExecutionStages: string[];

  @ApiProperty({ type: [String], description: 'ONX modules expected to be affected.' })
  affectedModules: string[];

  @ApiProperty({ type: [String], description: 'Execution risks found during simulation.' })
  executionRisks: string[];
}

export class FounderIntentHistoryQueryDto {
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

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class FounderIntentHistoryItemDto {
  @ApiProperty({ example: 'cmfounderintent123' })
  id: string;

  @ApiProperty({ example: 'Scale evidence throughput' })
  objective: string;

  @ApiProperty({ example: 0.81 })
  confidenceScore: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
