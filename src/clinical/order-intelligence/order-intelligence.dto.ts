import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class ClinicalOrderRecommendationDto {
  @IsString()
  workspaceId!: string;

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