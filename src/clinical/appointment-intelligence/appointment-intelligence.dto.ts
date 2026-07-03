import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class AddToWaitlistDto {
  @IsString()
  workspaceId!: string;

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
  @IsString()
  workspaceId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxPatients?: number;
}