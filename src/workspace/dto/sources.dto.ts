import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface CreateSourceDto {
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: string;
  newValue?: string;
}

export interface UpdateSourceDto {
  action?: string;
  resource?: string;
  resourceId?: string;
  oldValue?: string;
  newValue?: string;
}

export class CreateSourceRequestDto implements CreateSourceDto {
  @ApiProperty({
    description: 'Source action label. Must be a non-empty string.',
    example: 'UPDATED',
  })
  action!: string;

  @ApiProperty({
    description: 'Target resource name. Must be a non-empty string.',
    example: 'IntelligenceObject',
  })
  resource!: string;

  @ApiPropertyOptional({
    description: 'Linked intelligence object id in the same workspace.',
    example: 'cmf2xyz123abc',
  })
  resourceId?: string;

  @ApiPropertyOptional({
    description: 'Previous value snapshot.',
    example: '{"title":"Old Title"}',
  })
  oldValue?: string;

  @ApiPropertyOptional({
    description: 'New value snapshot.',
    example: '{"title":"New Title"}',
  })
  newValue?: string;
}

export class UpdateSourceRequestDto implements UpdateSourceDto {
  @ApiPropertyOptional({
    description: 'Updated source action label.',
    example: 'DELETED',
  })
  action?: string;

  @ApiPropertyOptional({
    description: 'Updated target resource name.',
    example: 'KnowledgeAsset',
  })
  resource?: string;

  @ApiPropertyOptional({
    description: 'Updated linked intelligence object id.',
    example: 'cmf2xyz123abc',
  })
  resourceId?: string;

  @ApiPropertyOptional({
    description: 'Updated previous value snapshot.',
    example: '{"status":"draft"}',
  })
  oldValue?: string;

  @ApiPropertyOptional({
    description: 'Updated new value snapshot.',
    example: '{"status":"published"}',
  })
  newValue?: string;
}
