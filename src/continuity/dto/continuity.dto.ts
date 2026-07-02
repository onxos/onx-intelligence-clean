import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PROTECTED_OBJECT_TYPES } from '../continuity.constants';

class ContinuityBaseDto {
  @ApiProperty({ enum: PROTECTED_OBJECT_TYPES, example: 'understanding' })
  @IsString()
  targetType: string;

  @ApiProperty({ example: 'UN-1' })
  @IsString()
  @MaxLength(200)
  targetId: string;

  @ApiPropertyOptional({ example: 'Refined interpretation after new evidence.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional({ type: Object, description: 'Snapshot of the value before the change.' })
  @IsOptional()
  @IsObject()
  previousValue?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object, description: 'The new value.' })
  @IsOptional()
  @IsObject()
  newValue?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'speculative' })
  @IsOptional()
  @IsString()
  tierFrom?: string;

  @ApiPropertyOptional({ example: 'probable' })
  @IsOptional()
  @IsString()
  tierTo?: string;

  @ApiPropertyOptional({ example: 'DG-09', description: 'Approver authority for a tier upgrade.' })
  @IsOptional()
  @IsString()
  approverAuthority?: string;

  @ApiPropertyOptional({ example: 'UN-0', description: 'The superseded prior version ref.' })
  @IsOptional()
  @IsString()
  previousRef?: string;

  @ApiPropertyOptional({ example: 'trace-continuity-1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  traceId?: string;
}

export class ContinuityWriteDto extends ContinuityBaseDto {}

export class GuardOperationDto extends ContinuityBaseDto {
  @ApiProperty({
    example: 'UPDATE',
    description: 'Proposed operation. UPDATE/DELETE/OVERWRITE are blocked (HC-04).',
  })
  @IsString()
  operation: string;
}

export class ContinuityListQueryDto {
  @ApiPropertyOptional({ enum: PROTECTED_OBJECT_TYPES })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({ example: 'BLOCKED_UPDATE' })
  @IsOptional()
  @IsString()
  operation?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  blocked?: boolean;

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
