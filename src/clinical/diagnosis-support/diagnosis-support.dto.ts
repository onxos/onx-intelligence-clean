import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class ClinicalDiagnosisSupportDto {
  @IsArray()
  @Type(() => String)
  symptoms!: string[];

  @IsOptional()
  @IsString()
  history?: string;

  @IsOptional()
  @IsString()
  species?: string;

  @IsOptional()
  @IsString()
  patientName?: string;
}