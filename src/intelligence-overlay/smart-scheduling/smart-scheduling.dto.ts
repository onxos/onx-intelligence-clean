import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ScheduleSlotDto {
  @IsString()
  start!: string;

  @IsString()
  end!: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class OptimizeScheduleDto {
  @IsArray()
  slots!: ScheduleSlotDto[];

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  historicalNoShows?: number[];

  @IsOptional()
  @IsString()
  constraints?: string;
}

export class AutoFillDto {
  @IsArray()
  slots!: ScheduleSlotDto[];
}
