import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ConfigureConnectorDto {
  @ApiProperty({ example: 'twilio', description: 'Provider key for this connector.' })
  @IsString()
  @MaxLength(60)
  provider: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: Object,
    description: 'Provider credentials (stored redacted in responses).',
  })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: Object,
    description: 'Connector settings, e.g. { account: "+15551234567" }.',
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class SyncConnectorDto {
  @ApiPropertyOptional({ example: 'vettriage' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider?: string;

  @ApiPropertyOptional({
    description: 'Optional mock records to ingest (test/demo without live API).',
    type: [Object],
  })
  @IsOptional()
  records?: Record<string, unknown>[];
}

export class ConnectorLogQueryDto {
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

  @ApiPropertyOptional({ example: 'processed' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ example: 'twilio' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider?: string;
}
