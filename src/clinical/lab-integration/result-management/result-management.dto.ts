import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateLabResultDto {
  @IsString()
  orderId!: string;

  @IsString()
  patientId!: string;

  @IsString()
  testCode!: string;

  @IsString()
  testName!: string;

  @IsString()
  value!: string;

  @IsString()
  unit!: string;

  @IsString()
  referenceRange!: string;

  @IsOptional()
  @IsIn(['PENDING', 'NORMAL', 'ABNORMAL', 'CRITICAL'])
  status?: 'PENDING' | 'NORMAL' | 'ABNORMAL' | 'CRITICAL';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListLabResultsQueryDto {
  @IsOptional()
  @IsString()
  patientId?: string;
}

export class ReviewLabResultDto {
  @IsOptional()
  @IsIn(['PENDING', 'NORMAL', 'ABNORMAL', 'CRITICAL'])
  status?: 'PENDING' | 'NORMAL' | 'ABNORMAL' | 'CRITICAL';

  @IsOptional()
  @IsString()
  reviewedBy?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
