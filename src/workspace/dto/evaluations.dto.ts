import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface CreateEvaluationDto {
  providerId: string;
  intent: string;
  context?: string;
  iseScore?: number;
  dimensions?: Record<string, any> | string;
}

export interface UpdateEvaluationDto {
  intent?: string;
  context?: string;
  iseScore?: number;
  dimensions?: Record<string, any> | string;
}

export class CreateEvaluationRequestDto implements CreateEvaluationDto {
  @ApiProperty({
    description: 'External provider identifier (ProviderProfile.providerId).',
    example: 'prov-123',
  })
  providerId!: string;

  @ApiProperty({
    description: 'Evaluation intent. Must be a non-empty string.',
    example: 'quality-benchmark',
  })
  intent!: string;

  @ApiPropertyOptional({
    description: 'Optional evaluation context.',
    example: 'Arabic customer support benchmark',
  })
  context?: string;

  @ApiPropertyOptional({
    description: 'Optional ISE score override.',
    example: 87.5,
  })
  iseScore?: number;

  @ApiPropertyOptional({
    description: 'Evaluation dimensions object or JSON object string.',
    example: { latency: 120, relevance: 0.94 },
    oneOf: [{ type: 'object' }, { type: 'string' }],
  })
  dimensions?: Record<string, any> | string;
}

export class UpdateEvaluationRequestDto implements UpdateEvaluationDto {
  @ApiPropertyOptional({
    description: 'Updated evaluation intent.',
    example: 'production-regression-check',
  })
  intent?: string;

  @ApiPropertyOptional({
    description: 'Updated evaluation context.',
    example: 'Post-release monitoring window',
  })
  context?: string;

  @ApiPropertyOptional({
    description: 'Updated ISE score.',
    example: 91.2,
  })
  iseScore?: number;

  @ApiPropertyOptional({
    description: 'Updated dimensions object or JSON object string.',
    example: { toxicity: 0.01, groundedness: 0.96 },
    oneOf: [{ type: 'object' }, { type: 'string' }],
  })
  dimensions?: Record<string, any> | string;
}
