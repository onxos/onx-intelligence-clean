import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export type ClinicalPatientStatus = 'stable' | 'monitoring' | 'critical';

export class ClinicalPatientListQueryDto {
  @IsOptional()
  @IsIn(['stable', 'monitoring', 'critical'])
  status?: ClinicalPatientStatus;
}

export class CreateClinicalPatientDto {
  @IsString()
  name!: string;

  @IsString()
  species!: string;

  @IsString()
  breed!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  ageYears!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightKg!: number;

  @IsOptional()
  @IsIn(['stable', 'monitoring', 'critical'])
  status?: ClinicalPatientStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  presentingSigns?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

}

export class UpdateClinicalPatientStatusDto {
  @IsIn(['stable', 'monitoring', 'critical'])
  status!: ClinicalPatientStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AddClinicalLifecycleEventDto {
  @IsString()
  eventType!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsIn(['stable', 'monitoring', 'critical'])
  nextStatus?: ClinicalPatientStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}