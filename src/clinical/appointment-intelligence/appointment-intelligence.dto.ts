import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  patientId!: string;

  @IsString()
  date!: string;

  @IsString()
  type!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddToWaitlistDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority?: number;
}

export class BuildScheduleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxPatients?: number;
}