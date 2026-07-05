import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Invoice, Prisma } from '@prisma/client';

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.InvoiceCreateInput): Promise<Invoice> {
    return this.prisma.invoice.create({
      data,
      include: { items: true, payments: true },
    });
  }

  async findAll(workspaceId: string): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: { workspaceId },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, workspaceId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, workspaceId },
      include: { items: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async findByPatient(patientId: string, workspaceId: string): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: { patientId, workspaceId },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByStatus(workspaceId: string, status: string): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: { workspaceId, status: status as any },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOverdue(workspaceId: string, asOf: Date): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        workspaceId,
        status: { in: ['SENT', 'PARTIAL'] },
        dueDate: { lt: asOf },
      },
      include: { items: true, payments: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async update(id: string, workspaceId: string, data: Prisma.InvoiceUpdateInput): Promise<Invoice> {
    await this.findOne(id, workspaceId);
    return this.prisma.invoice.update({
      where: { id },
      data,
      include: { items: true, payments: true },
    });
  }

  async updateStatus(id: string, workspaceId: string, status: string): Promise<Invoice> {
    await this.findOne(id, workspaceId);
    return this.prisma.invoice.update({
      where: { id },
      data: { status: status as any },
      include: { items: true, payments: true },
    });
  }

  async remove(id: string, workspaceId: string): Promise<Invoice> {
    await this.findOne(id, workspaceId);
    return this.prisma.invoice.delete({ where: { id } });
  }
}
