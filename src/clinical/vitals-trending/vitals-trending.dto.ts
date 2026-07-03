import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ClinicalVitalReadingDto {
  @IsString()
  kind!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class AnalyzeVitalsDto {
  @IsString()
  patientId!: string;

  @IsArray()
  readings!: ClinicalVitalReadingDto[];
}