import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class DiagnoseDto {
  @IsArray()
  @Type(() => String)
  symptoms!: string[];

  @IsOptional()
  @IsString()
  patientHistory?: string;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  labResults?: string[];

  @IsOptional()
  @IsString()
  patientId?: string;
}

export class DiagnosisFeedbackDto {
  @IsString()
  verdict!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
