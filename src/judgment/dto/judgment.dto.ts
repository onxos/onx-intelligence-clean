import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class FormJudgmentDto {
  @ApiProperty({
    example: 'UN-1',
    description: 'UnderstandingObject understandingId (realityTier >= probable).',
  })
  @IsString()
  understandingId: string;

  @ApiPropertyOptional({ example: 'Adopt 48h communication policy' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  subject?: string;

  @ApiPropertyOptional({ example: 'Require 48h advance notice for schedule changes.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decision?: string;

  @ApiPropertyOptional({
    example: 'Because prior no-show spikes correlated with unannounced changes.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reasoning?: string;

  @ApiPropertyOptional({ type: [String], example: ['FI-2026-0017'] })
  @IsOptional()
  @IsString({ each: true })
  relatedIntents?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;
}

export class ValidateJudgmentDto {
  @ApiProperty({ example: true, description: 'Whether the judgment outcome was correct.' })
  @IsBoolean()
  correct: boolean;

  @ApiPropertyOptional({
    example: 'branch-central',
    description: 'Branch the outcome was observed at (SC-06).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @ApiPropertyOptional({ example: 'evidence-rec-1' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  evidenceRef?: string;
}

export class PromoteJudgmentDto {
  @ApiPropertyOptional({
    example: 'ops-manager',
    description: 'Approver (DG-09 Ops Manager / DG-10 Founder).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  approver?: string;

  @ApiPropertyOptional({ example: 'Consistently correct across branches.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class JudgmentListQueryDto {
  @ApiPropertyOptional({ example: 'preliminary' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'probable' })
  @IsOptional()
  @IsString()
  realityTier?: string;

  @ApiPropertyOptional({ example: 'clinical' })
  @IsOptional()
  @IsString()
  domain?: string;

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
