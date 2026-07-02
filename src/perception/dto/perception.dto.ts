import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PERCEPTION_DOMAINS, PERCEPTION_SOURCE_TYPES } from '../perception.constants';

export class IngestPerceptionDto {
  @ApiProperty({ enum: PERCEPTION_SOURCE_TYPES, example: 'emr' })
  @IsString()
  @IsIn(PERCEPTION_SOURCE_TYPES as unknown as string[])
  sourceType: string;

  @ApiPropertyOptional({ example: 'emr-patient-9931', description: 'External system id.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceId?: string;

  @ApiProperty({
    type: Object,
    description: 'Raw perception payload. May carry { signals, subject, summary, playbooks }.',
    example: { summary: 'New vaccination protocol observation', subject: 'protocol-rabies' },
  })
  @IsObject()
  rawPayload: Record<string, any>;

  @ApiPropertyOptional({ enum: PERCEPTION_DOMAINS, example: 'clinical' })
  @IsOptional()
  @IsString()
  @IsIn(PERCEPTION_DOMAINS as unknown as string[])
  proposedDomain?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 4, description: 'AC-05 evidence tier.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  proposedTier?: number;

  @ApiPropertyOptional({ example: 'trace-perc-1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  traceId?: string;
}

export class PerceptionListQueryDto {
  @ApiPropertyOptional({ enum: PERCEPTION_SOURCE_TYPES })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional({ example: 'approved' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: PERCEPTION_DOMAINS })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  tier?: number;

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
