import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ProcessPaymentDto {
  @IsString()
  invoiceId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsIn(['CASH', 'CARD', 'CHECK', 'STRIPE', 'SQUARE', 'TRANSFER'])
  method!: 'CASH' | 'CARD' | 'CHECK' | 'STRIPE' | 'SQUARE' | 'TRANSFER';
}

export class StripePaymentDto {
  @IsString()
  invoiceId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  stripeId!: string;
}

export class SquarePaymentDto {
  @IsString()
  invoiceId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  squareId!: string;
}

export class RefundPaymentDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
