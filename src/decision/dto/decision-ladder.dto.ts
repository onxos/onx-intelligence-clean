import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class StartLadderDto {
  @ApiProperty({ example: 'RC-123', description: 'UsfipPerceptionRecord id or recordId.' })
  @IsString()
  @MaxLength(200)
  perceptionId: string;

  @ApiPropertyOptional({ example: 'Adopt new rabies vaccination protocol' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  subject?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Signals for the SECH FIC checks at D8 (pre_decision) and D14 (post_outcome).',
    example: { profitOverCare: false },
  })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;

  @ApiPropertyOptional({
    example: 'DG-01',
    description: 'If set, the D10 Choose step pauses for this Decision Gate approver.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  humanGateType?: string;

  @ApiPropertyOptional({ example: 'trace-ladder-1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  traceId?: string;
}

export class ApproveGateDto {
  @ApiPropertyOptional({
    example: 'founder-user-id',
    description: 'Approver (defaults to caller).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  approver?: string;

  @ApiPropertyOptional({ example: 'Aligned with care-first pillar.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class DecisionRunListQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED', 'PROMOTED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'D10' })
  @IsOptional()
  @IsString()
  currentStep?: string;

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
