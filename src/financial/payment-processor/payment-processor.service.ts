import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  ProcessPaymentDto,
  RefundPaymentDto,
  SquarePaymentDto,
  StripePaymentDto,
} from './payment-processor.dto';

@Injectable()
export class PaymentProcessorService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureInvoice(workspaceId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, workspaceId } });
    if (!invoice) {
      throw new NotFoundException(`Invoice not found: ${invoiceId}`);
    }
    return invoice;
  }

  private async applyInvoicePayment(workspaceId: string, invoiceId: string) {
    const [invoice, payments] = await Promise.all([
      this.ensureInvoice(workspaceId, invoiceId),
      this.prisma.payment.findMany({
        where: {
          workspaceId,
          invoiceId,
          status: 'COMPLETED',
        },
      }),
    ]);

    const amountPaidNumber = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalNumber = Number(invoice.total);
    const balanceNumber = Math.max(0, totalNumber - amountPaidNumber);

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: new Prisma.Decimal(amountPaidNumber.toFixed(2)),
        balanceDue: new Prisma.Decimal(balanceNumber.toFixed(2)),
        status: balanceNumber <= 0 ? 'PAID' : invoice.status,
        paidAt: balanceNumber <= 0 ? new Date() : invoice.paidAt,
      },
    });
  }

  async process(workspaceId: string, dto: ProcessPaymentDto) {
    await this.ensureInvoice(workspaceId, dto.invoiceId);

    const payment = await this.prisma.payment.create({
      data: {
        workspaceId,
        invoiceId: dto.invoiceId,
        amount: new Prisma.Decimal(dto.amount.toFixed(2)),
        method: dto.method,
        status: 'COMPLETED',
        processedAt: new Date(),
      },
    });

    await this.applyInvoicePayment(workspaceId, dto.invoiceId);
    return payment;
  }

  processStripe(workspaceId: string, dto: StripePaymentDto) {
    return this.process(workspaceId, {
      invoiceId: dto.invoiceId,
      amount: dto.amount,
      method: 'STRIPE',
    }).then(async (payment) => {
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { stripeId: dto.stripeId },
      });
      return updated;
    });
  }

  processSquare(workspaceId: string, dto: SquarePaymentDto) {
    return this.process(workspaceId, {
      invoiceId: dto.invoiceId,
      amount: dto.amount,
      method: 'SQUARE',
    }).then(async (payment) => {
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { squareId: dto.squareId },
      });
      return updated;
    });
  }

  async refund(workspaceId: string, id: string, dto: RefundPaymentDto) {
    const payment = await this.prisma.payment.findFirst({ where: { id, workspaceId } });
    if (!payment) {
      throw new NotFoundException(`Payment not found: ${id}`);
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        refundReason: dto.reason ?? 'Refund requested',
      },
    });

    await this.applyInvoicePayment(workspaceId, payment.invoiceId);
    return updated;
  }
}
