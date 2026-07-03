import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class TreatmentRecommendationDto {
  @IsString()
  diagnosis!: string;

  @IsString()
  species!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightKg!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ageYears!: number;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  allergies?: string[];
}

export class InteractionVerificationDto {
  @IsArray()
  @Type(() => String)
  medications!: string[];
}
