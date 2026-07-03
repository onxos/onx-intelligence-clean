import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class BuildSoapNoteDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  voiceTranscript?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsString()
  assessment?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  tags?: string[];
}