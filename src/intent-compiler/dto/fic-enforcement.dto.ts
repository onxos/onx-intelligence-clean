import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// ---------------------------------------------------------------------------
// SECH-FIC runtime enforcement check request (POST /sech/fic-check)
// ---------------------------------------------------------------------------

export class FicCheckRequestDto {
  @ApiPropertyOptional({
    example: 'appointment_scheduling',
    description: 'Optional check type / decision route label.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  checkType?: string;

  @ApiPropertyOptional({
    example: 'Reduce clinical staff by 2 to raise monthly margin.',
    description: 'Free-text description of the proposed decision for traceability.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionContext?: string;

  @ApiPropertyOptional({
    example: ['clinic_operations', 'revenue_optimization'],
    description: 'Affected playbook ids.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  playbooks?: string[];

  @ApiPropertyOptional({
    example: ['clinical', 'commercial', 'people'],
    description: 'Affected domains.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domains?: string[];

  @ApiPropertyOptional({
    description:
      'Signal map describing the proposed action. Keys map to constraint signal keys (e.g. reducesClinicalStaffForRevenue, discountGate, emergencyMedical). Values are boolean or numeric.',
    example: { reducesClinicalStaffForRevenue: true, profitOverCare: true },
    type: Object,
  })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;

  @ApiPropertyOptional({
    example: 'trace-abc-123',
    description: 'Caller trace id for correlation.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  traceId?: string;
}

// ---------------------------------------------------------------------------
// Enforcement check history listing
// ---------------------------------------------------------------------------

export class FicCheckListQueryDto {
  @ApiPropertyOptional({ enum: ['APPROVED', 'REJECTED', 'CONFLICT', 'OVERRIDE'] })
  @IsOptional()
  @IsString()
  decision?: string;

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
