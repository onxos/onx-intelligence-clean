import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class RevenueCycleService {
  constructor(private readonly prisma: PrismaService) {}

  private periodBounds(period: string) {
    const [year, month] = period.split('-').map((value) => Number(value));
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    return { start, end };
  }

  async generate(workspaceId: string, period: string) {
    const { start, end } = this.periodBounds(period);
    const [invoices, payments, claims] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          workspaceId,
          createdAt: { gte: start, lt: end },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          workspaceId,
          status: 'COMPLETED',
          processedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.insuranceClaim.findMany({
        where: {
          workspaceId,
          createdAt: { gte: start, lt: end },
        },
      }),
    ]);

    const now = new Date();
    let aging0_30 = 0;
    let aging31_60 = 0;
    let aging61_90 = 0;
    let aging90plus = 0;

    for (const invoice of invoices) {
      const balance = Number(invoice.balanceDue);
      if (balance <= 0) {
        continue;
      }
      const ageDays = Math.floor((now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays <= 30) {
        aging0_30 += balance;
      } else if (ageDays <= 60) {
        aging31_60 += balance;
      } else if (ageDays <= 90) {
        aging61_90 += balance;
      } else {
        aging90plus += balance;
      }
    }

    const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const totalClaims = claims.reduce((sum, claim) => sum + Number(claim.amountClaimed), 0);
    const outstanding = invoices.reduce((sum, inv) => sum + Number(inv.balanceDue), 0);

    return this.prisma.revenueReport.upsert({
      where: {
        workspaceId_period: {
          workspaceId,
          period,
        },
      },
      update: {
        totalBilled: new Prisma.Decimal(totalBilled.toFixed(2)),
        totalPaid: new Prisma.Decimal(totalPaid.toFixed(2)),
        totalClaims: new Prisma.Decimal(totalClaims.toFixed(2)),
        outstanding: new Prisma.Decimal(outstanding.toFixed(2)),
        writeOffs: new Prisma.Decimal('0.00'),
        adjustments: new Prisma.Decimal('0.00'),
        aging0_30: new Prisma.Decimal(aging0_30.toFixed(2)),
        aging31_60: new Prisma.Decimal(aging31_60.toFixed(2)),
        aging61_90: new Prisma.Decimal(aging61_90.toFixed(2)),
        aging90plus: new Prisma.Decimal(aging90plus.toFixed(2)),
      },
      create: {
        workspaceId,
        period,
        totalBilled: new Prisma.Decimal(totalBilled.toFixed(2)),
        totalPaid: new Prisma.Decimal(totalPaid.toFixed(2)),
        totalClaims: new Prisma.Decimal(totalClaims.toFixed(2)),
        outstanding: new Prisma.Decimal(outstanding.toFixed(2)),
        writeOffs: new Prisma.Decimal('0.00'),
        adjustments: new Prisma.Decimal('0.00'),
        aging0_30: new Prisma.Decimal(aging0_30.toFixed(2)),
        aging31_60: new Prisma.Decimal(aging31_60.toFixed(2)),
        aging61_90: new Prisma.Decimal(aging61_90.toFixed(2)),
        aging90plus: new Prisma.Decimal(aging90plus.toFixed(2)),
      },
    });
  }

  async summary(workspaceId: string, period: string) {
    return this.generate(workspaceId, period);
  }

  async aging(workspaceId: string, period?: string) {
    if (period) {
      return this.generate(workspaceId, period).then((report) => ({
        period: report.period,
        aging0_30: report.aging0_30,
        aging31_60: report.aging31_60,
        aging61_90: report.aging61_90,
        aging90plus: report.aging90plus,
      }));
    }

    const latest = await this.prisma.revenueReport.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    return latest ?? null;
  }

  async trends(workspaceId: string) {
    return this.prisma.revenueReport.findMany({
      where: { workspaceId },
      orderBy: { period: 'asc' },
      take: 12,
    });
  }
}
