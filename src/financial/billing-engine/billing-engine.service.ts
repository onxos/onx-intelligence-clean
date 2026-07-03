import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { CreateInvoiceDto, ListInvoiceQueryDto, UpdateInvoiceDto } from './billing-engine.dto';

@Injectable()
export class BillingEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, userId: string, dto: CreateInvoiceDto) {
    const subtotalNumber = dto.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
    const taxRateNumber = dto.taxRate ?? 0;
    const taxAmountNumber = subtotalNumber * (taxRateNumber / 100);
    const totalNumber = subtotalNumber + taxAmountNumber;

    const subtotal = new Prisma.Decimal(subtotalNumber.toFixed(2));
    const taxRate = new Prisma.Decimal(taxRateNumber.toFixed(2));
    const taxAmount = new Prisma.Decimal(taxAmountNumber.toFixed(2));
    const total = new Prisma.Decimal(totalNumber.toFixed(2));
    const amountPaid = new Prisma.Decimal('0.00');
    const balanceDue = new Prisma.Decimal(totalNumber.toFixed(2));

    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

    return this.prisma.invoice.create({
      data: {
        workspaceId,
        patientId: dto.patientId,
        appointmentId: dto.appointmentId,
        invoiceNumber,
        status: 'DRAFT',
        subtotal,
        taxRate,
        taxAmount,
        total,
        amountPaid,
        balanceDue,
        dueDate: new Date(dto.dueDate),
        notes: dto.notes,
        createdBy: userId,
        items: {
          create: dto.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice.toFixed(2)),
            totalPrice: new Prisma.Decimal((item.quantity * item.unitPrice).toFixed(2)),
            type: item.type,
          })),
        },
      },
      include: { items: true, payments: true },
    });
  }

  list(workspaceId: string, query: ListInvoiceQueryDto) {
    return this.prisma.invoice.findMany({
      where: {
        workspaceId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(workspaceId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, workspaceId },
      include: { items: true, payments: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice not found: ${id}`);
    }

    return invoice;
  }

  async update(workspaceId: string, id: string, dto: UpdateInvoiceDto) {
    await this.getById(workspaceId, id);
    return this.prisma.invoice.update({
      where: { id },
      data: {
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
        status: dto.status,
      },
      include: { items: true, payments: true },
    });
  }

  async void(workspaceId: string, id: string) {
    await this.getById(workspaceId, id);
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'VOID' },
      include: { items: true, payments: true },
    });
  }

  async send(workspaceId: string, id: string) {
    await this.getById(workspaceId, id);
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'SENT' },
      include: { items: true, payments: true },
    });
  }
}
