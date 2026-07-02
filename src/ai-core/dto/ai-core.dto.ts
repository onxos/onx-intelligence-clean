import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AiQueryDto {
  @ApiProperty({ example: 'Summarize the risk factors for feline chronic kidney disease.' })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  query: string;

  @ApiPropertyOptional({ example: 'clinical', description: 'Business/clinical domain.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  domain?: string;

  @ApiPropertyOptional({ example: 'openai', description: 'Pin a specific provider.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  providerId?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'FIC/SECH signal map for the pre_execution gate.',
  })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;

  @ApiPropertyOptional({
    type: Object,
    description: 'Optional generation context (system prompt, temperature, etc.).',
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class AiConsensusDto {
  @ApiProperty({ example: 'Is a 12% price increase on wellness plans defensible?' })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  query: string;

  @ApiPropertyOptional({ example: 'commercial' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  domain?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;
}

export class ChatMessageDto {
  @ApiProperty({ enum: ['system', 'user', 'assistant'], example: 'user' })
  @IsIn(['system', 'user', 'assistant'])
  role: 'system' | 'user' | 'assistant';

  @ApiProperty({ example: 'What are the differentials for acute vomiting in a dog?' })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content: string;
}

export class AiChatDto {
  @ApiProperty({ type: [ChatMessageDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @ApiPropertyOptional({ example: 'clinical' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  domain?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;
}

export class ClinicalDiagnosisDto {
  @ApiProperty({ type: [String], example: ['lethargy', 'anorexia', 'polydipsia'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  symptoms: string[];

  @ApiPropertyOptional({ example: '8-year-old neutered male cat, indoor.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  history?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;
}

export class ClinicalProtocolDto {
  @ApiProperty({ example: 'canine parvovirus enteritis' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  condition: string;

  @ApiPropertyOptional({ example: 'small rural clinic, limited isolation capacity' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  context?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  signals?: Record<string, boolean | number>;
}

export class AiQueryLogListDto {
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

  @ApiPropertyOptional({ example: 'clinical' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  domain?: string;

  @ApiPropertyOptional({ example: 'APPROVED' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ficStatus?: string;
}
