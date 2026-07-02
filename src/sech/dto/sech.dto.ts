import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SechRouteRequestDto {
  @ApiPropertyOptional({ example: 'branch_expansion_decision', description: 'Route label.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  checkType?: string;

  @ApiPropertyOptional({
    example: 'Promote the "reduce reception hours" judgment and route to execution.',
    description: 'Free-text description of the decision being routed.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionContext?: string;

  @ApiPropertyOptional({ type: [String], example: ['clinic_operations'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  playbooks?: string[];

  @ApiPropertyOptional({ type: [String], example: ['clinical', 'operational'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domains?: string[];

  @ApiPropertyOptional({
    type: Object,
    description: 'Base signal map applied at every gate.',
    example: { profitOverCare: true },
  })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Optional per-gate signal overrides keyed by checkType (pre_judgment|pre_decision|pre_execution|post_outcome). Merged over the base signals for that gate.',
    example: { pre_execution: { emergencyMedical: true } },
  })
  @IsOptional()
  @IsObject()
  gateSignals?: Record<string, Record<string, boolean | number>>;

  @ApiPropertyOptional({ example: 'trace-route-1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  traceId?: string;
}

export class SechPendingQueryDto {
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
  pageSize?: number;
}
