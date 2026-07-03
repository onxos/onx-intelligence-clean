import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateClinicalOrderDto {
  @IsString()
  patientId!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  testCode?: string;

  @IsOptional()
  @IsString()
  medicationName?: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  veterinarianId?: string;
}

export class ClinicalOrderRecommendationDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  symptoms?: string[];

  @IsOptional()
  @IsArray()
  @Type(() => String)
  currentMedications?: string[];
}