import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateLabQualityControlDto {
  @IsString()
  testCode!: string;

  @IsString()
  controlName!: string;

  @IsString()
  expectedValue!: string;

  @IsString()
  actualValue!: string;

  @IsOptional()
  @IsIn(['PASS', 'FAIL', 'WARNING'])
  status?: 'PASS' | 'FAIL' | 'WARNING';

  @IsOptional()
  @IsString()
  reviewedBy?: string;
}

export class ListLabQualityControlQueryDto {
  @IsOptional()
  @IsString()
  testCode?: string;
}
