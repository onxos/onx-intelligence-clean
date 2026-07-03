import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateLabOrderDto {
  @IsString()
  patientId!: string;

  @IsString()
  orderType!: string;

  @IsArray()
  @Type(() => String)
  testCodes!: string[];

  @IsOptional()
  @IsIn(['ROUTINE', 'URGENT', 'STAT'])
  priority?: 'ROUTINE' | 'URGENT' | 'STAT';

  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListLabOrdersQueryDto {
  @IsOptional()
  @IsString()
  patientId?: string;
}

export class UpdateLabOrderStatusDto {
  @IsIn(['PENDING', 'COLLECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED'])
  status!: 'PENDING' | 'COLLECTED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
}
