import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RunAssessmentDto {
  @ApiPropertyOptional({ enum: ['full', 'module', 'constraint'], example: 'full' })
  @IsOptional()
  @IsString()
  @IsIn(['full', 'module', 'constraint'])
  scope?: string;

  @ApiPropertyOptional({ example: 'judgment' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetModule?: string;
}
