import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CreateClaimDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsString()
  provider!: string;

  @IsString()
  policyNumber!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountClaimed!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListClaimsQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'SUBMITTED', 'APPROVED', 'DENIED', 'APPEALED'])
  status?: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'DENIED' | 'APPEALED';
}

export class UpdateClaimStatusDto {
  @IsIn(['PENDING', 'SUBMITTED', 'APPROVED', 'DENIED', 'APPEALED'])
  status!: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'DENIED' | 'APPEALED';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountApproved?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
