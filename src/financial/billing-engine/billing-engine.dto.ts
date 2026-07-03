import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class InvoiceItemDto {
  @IsString()
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsIn(['SERVICE', 'PRODUCT', 'LAB', 'MEDICATION'])
  type!: 'SERVICE' | 'PRODUCT' | 'LAB' | 'MEDICATION';
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  items!: InvoiceItemDto[];
}

export class ListInvoiceQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID'])
  status?: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'VOID';
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID'])
  status?: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'VOID';
}
