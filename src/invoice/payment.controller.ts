import { Body, Controller, Get, Param, Post, Query, UseGuards, Req } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Post()
  async create(@Body() data: Prisma.PaymentCreateInput, @Req() req: any) {
    const result = await this.prisma.payment.create({
      data,
      include: { invoice: true },
    });
    await this.updateInvoiceBalance(result.invoiceId, result.workspaceId);
    await this.auditService.log({ action: 'CREATE_PAYMENT', resource: 'Payment', resourceId: result.id, actorId: req.user?.userId || 'system', workspaceId: data.workspaceId as string, newValue: result });
    return result;
  }

  @Get()
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.prisma.payment.findMany({ where: { workspaceId }, include: { invoice: true }, orderBy: { paidAt: 'desc' } });
  }

  @Get('invoice/:invoiceId')
  async findByInvoice(@Param('invoiceId') invoiceId: string, @Query('workspaceId') workspaceId: string) {
    return this.prisma.payment.findMany({ where: { invoiceId, workspaceId }, orderBy: { paidAt: 'desc' } });
  }

  private async updateInvoiceBalance(invoiceId: string, workspaceId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, workspaceId }, include: { payments: true } });
    if (!invoice) return;
    const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    let status = invoice.status;
    if (paid >= invoice.total) status = 'PAID';
    else if (paid > 0) status = 'PARTIAL';
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { paidAmount: paid, balance: invoice.total - paid, status: status as any } });
  }
}
