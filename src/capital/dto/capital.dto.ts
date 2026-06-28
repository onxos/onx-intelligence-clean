import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CapitalCategory } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export const ALLOCATION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'ALLOCATED',
  'CANCELLED',
  'ARCHIVED',
] as const;

export const POLICY_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const CAPITAL_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'amount',
  'priority',
  'category',
  'status',
] as const;

export class CapitalListQueryDto {
  @ApiPropertyOptional({ description: 'Free text search across key capital fields.', example: 'reserve' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CapitalCategory, example: CapitalCategory.OPERATIONS })
  @IsOptional()
  @IsEnum(CapitalCategory)
  category?: CapitalCategory;

  @ApiPropertyOptional({ enum: ALLOCATION_STATUSES, example: 'PENDING_APPROVAL' })
  @IsOptional()
  @IsIn(ALLOCATION_STATUSES)
  status?: (typeof ALLOCATION_STATUSES)[number];

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

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

  @ApiPropertyOptional({ enum: CAPITAL_SORT_FIELDS, example: 'createdAt' })
  @IsOptional()
  @IsIn(CAPITAL_SORT_FIELDS)
  sortBy?: (typeof CAPITAL_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class CreateAllocationDto {
  @ApiProperty({ description: 'Capital category for the allocation.', enum: CapitalCategory, example: CapitalCategory.OPERATIONS })
  @IsEnum(CapitalCategory)
  category: CapitalCategory;

  @ApiProperty({ description: 'Requested allocation amount.', example: 250000 })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Currency code for the allocation.', example: 'USD' })
  @IsString()
  @MinLength(3)
  currency: string;

  @ApiPropertyOptional({ description: 'Capital source or originating pool.', example: 'Treasury Reserve' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Target program or destination.', example: 'Clinical AI Expansion' })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({ description: 'Allocation lifecycle state.', enum: ALLOCATION_STATUSES, example: 'DRAFT' })
  @IsOptional()
  @IsIn(ALLOCATION_STATUSES)
  status?: (typeof ALLOCATION_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Priority from 1 to 10.', example: 3, default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ description: 'Business rationale for the allocation.', example: 'Fund the next evidence ingestion wave.' })
  @IsOptional()
  @IsString()
  rationale?: string;

  @ApiPropertyOptional({ description: 'Optional related policy identifier.', example: 'cmcapitalpolicy123' })
  @IsOptional()
  @IsString()
  policyId?: string;
}

export class UpdateAllocationDto {
  @ApiPropertyOptional({ enum: CapitalCategory, example: CapitalCategory.STRATEGY })
  @IsOptional()
  @IsEnum(CapitalCategory)
  category?: CapitalCategory;

  @ApiPropertyOptional({ example: 310000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Strategic Reserve' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'Governance Scale-Up' })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({ enum: ALLOCATION_STATUSES, example: 'PENDING_APPROVAL' })
  @IsOptional()
  @IsIn(ALLOCATION_STATUSES)
  status?: (typeof ALLOCATION_STATUSES)[number];

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ example: 'Raise priority to align with board decision.' })
  @IsOptional()
  @IsString()
  rationale?: string;

  @ApiPropertyOptional({ example: 'Waiting for final review.' })
  @IsOptional()
  @IsString()
  decisionReason?: string;

  @ApiPropertyOptional({ example: 'cmcapitalpolicy123' })
  @IsOptional()
  @IsString()
  policyId?: string;
}

export class AllocationActionDto {
  @ApiPropertyOptional({ description: 'Decision rationale recorded for the action.', example: 'Budget released after governance review.' })
  @IsOptional()
  @IsString()
  rationale?: string;

  @ApiPropertyOptional({ description: 'Decision reason for approve or reject.', example: 'Policy thresholds satisfied.' })
  @IsOptional()
  @IsString()
  decisionReason?: string;

  @ApiPropertyOptional({ description: 'Optional status override during transition.', enum: ALLOCATION_STATUSES, example: 'APPROVED' })
  @IsOptional()
  @IsIn(ALLOCATION_STATUSES)
  status?: (typeof ALLOCATION_STATUSES)[number];
}

export class PolicyListQueryDto {
  @ApiPropertyOptional({ example: 'reserve' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CapitalCategory, example: CapitalCategory.GOVERNANCE })
  @IsOptional()
  @IsEnum(CapitalCategory)
  category?: CapitalCategory;

  @ApiPropertyOptional({ enum: POLICY_STATUSES, example: 'ACTIVE' })
  @IsOptional()
  @IsIn(POLICY_STATUSES)
  status?: (typeof POLICY_STATUSES)[number];

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

  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'priority', 'name', 'status'], example: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'priority', 'name', 'status'])
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'name' | 'status';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class CreatePolicyDto {
  @ApiProperty({ description: 'Policy display name.', example: 'Governance Reserve Policy' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ description: 'Policy description.', example: 'Caps approval threshold at 500k unless escalated.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CapitalCategory, example: CapitalCategory.GOVERNANCE })
  @IsEnum(CapitalCategory)
  category: CapitalCategory;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Treasury Reserve' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'Governance Programs' })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({ enum: POLICY_STATUSES, example: 'ACTIVE' })
  @IsOptional()
  @IsIn(POLICY_STATUSES)
  status?: (typeof POLICY_STATUSES)[number];

  @ApiPropertyOptional({ example: 2, default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ example: 'Ensures reserve use remains policy-bound.' })
  @IsOptional()
  @IsString()
  rationale?: string;
}

export class UpdatePolicyDto {
  @ApiPropertyOptional({ example: 'Updated governance reserve policy' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description for the reserve policy.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CapitalCategory, example: CapitalCategory.OPERATIONS })
  @IsOptional()
  @IsEnum(CapitalCategory)
  category?: CapitalCategory;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Treasury Reserve' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'Operations Scaling' })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({ enum: POLICY_STATUSES, example: 'INACTIVE' })
  @IsOptional()
  @IsIn(POLICY_STATUSES)
  status?: (typeof POLICY_STATUSES)[number];

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ example: 'Reduced priority after quarterly review.' })
  @IsOptional()
  @IsString()
  rationale?: string;
}

export class CapitalReportQueryDto {
  @ApiPropertyOptional({ enum: CapitalCategory, example: CapitalCategory.KNOWLEDGE, description: 'Workspace-scoped category filter for additive ONX Intelligence capital reporting.' })
  @IsOptional()
  @IsEnum(CapitalCategory)
  category?: CapitalCategory;

  @ApiPropertyOptional({ enum: ALLOCATION_STATUSES, example: 'APPROVED' })
  @IsOptional()
  @IsIn(ALLOCATION_STATUSES)
  status?: (typeof ALLOCATION_STATUSES)[number];

  @ApiPropertyOptional({ example: 'USD', description: 'Currency filter over native capital metadata retained for future ONX Platform convergence.' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class CapitalHistoryQueryDto {
  @ApiPropertyOptional({ example: 'CAPITAL_ALLOCATION_APPROVED' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'cmcapitalallocation123' })
  @IsOptional()
  @IsString()
  allocationId?: string;

  @ApiPropertyOptional({ example: 'cmcapitalpolicy123' })
  @IsOptional()
  @IsString()
  policyId?: string;

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
}