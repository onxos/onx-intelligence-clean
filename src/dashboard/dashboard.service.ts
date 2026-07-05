import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface KpiSummary {
  totalPatients: number;
  newPatientsThisMonth: number;
  totalAppointmentsToday: number;
  upcomingAppointments: number;
  overdueInvoices: number;
  totalRevenueThisMonth: number;
  lowStockProducts: number;
  unreadNotifications: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  expenses: number;
}

export interface AppointmentStats {
  total: number;
  byStatus: { status: string; count: number }[];
  byType: { type: string; count: number }[];
}

export interface PatientStats {
  total: number;
  bySpecies: { species: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

export interface TopProducts {
  name: string;
  sku: string;
  sold: number;
  revenue: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getKpiSummary(workspaceId: string): Promise<KpiSummary> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [
      totalPatients,
      newPatientsThisMonth,
      totalAppointmentsToday,
      upcomingAppointments,
      overdueInvoices,
      totalRevenueThisMonth,
      lowStockProducts,
      unreadNotifications,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { workspaceId } }),
      this.prisma.patient.count({ where: { workspaceId, createdAt: { gte: startOfMonth } } }),
      this.prisma.appointment.count({ where: { workspaceId, date: { gte: startOfDay, lt: endOfDay } } }),
      this.prisma.appointment.count({ where: { workspaceId, date: { gte: now }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
      this.prisma.invoice.count({ where: { workspaceId, status: { in: ['SENT', 'PARTIAL', 'OVERDUE'] }, dueDate: { lt: now } } }),
      this.prisma.payment.aggregate({ where: { workspaceId, paidAt: { gte: startOfMonth } }, _sum: { amount: true } }).then(r => r._sum.amount || 0),
      this.countLowStockProducts(workspaceId),
      this.prisma.notification.count({ where: { workspaceId, readAt: null } }),
    ]);

    return { totalPatients, newPatientsThisMonth, totalAppointmentsToday, upcomingAppointments, overdueInvoices, totalRevenueThisMonth, lowStockProducts, unreadNotifications };
  }

  private async countLowStockProducts(workspaceId: string): Promise<number> {
    const products = await this.prisma.product.findMany({
      where: { workspaceId, isActive: true },
      select: { quantityOnHand: true, reorderLevel: true },
    });
    return products.filter((p) => p.quantityOnHand <= p.reorderLevel).length;
  }

  async getMonthlyRevenue(workspaceId: string, months: number = 12): Promise<MonthlyRevenue[]> {
    const results: MonthlyRevenue[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const year = now.getFullYear();
      const month = now.getMonth() - i;
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 1);
      const label = start.toLocaleString('default', { month: 'short', year: 'numeric' });

      const revenue = await this.prisma.payment.aggregate({
        where: { workspaceId, paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }).then(r => r._sum.amount || 0);

      const expenses = await this.prisma.inventoryTransaction.aggregate({
        where: { workspaceId, type: 'INCOMING', createdAt: { gte: start, lt: end } },
        _sum: { totalCost: true },
      }).then(r => r._sum.totalCost || 0);

      results.push({ month: label, revenue, expenses });
    }

    return results;
  }

  async getAppointmentStats(workspaceId: string): Promise<AppointmentStats> {
    const [total, byStatus, byType] = await Promise.all([
      this.prisma.appointment.count({ where: { workspaceId } }),
      this.prisma.appointment.groupBy({ by: ['status'], where: { workspaceId }, _count: { status: true } }),
      this.prisma.appointment.groupBy({ by: ['type'], where: { workspaceId }, _count: { type: true } }),
    ]);

    return {
      total,
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count.status })),
      byType: byType.map(t => ({ type: t.type, count: t._count.type })),
    };
  }

  async getPatientStats(workspaceId: string): Promise<PatientStats> {
    const [total, bySpecies, byStatus] = await Promise.all([
      this.prisma.patient.count({ where: { workspaceId } }),
      this.prisma.patient.groupBy({ by: ['species'], where: { workspaceId }, _count: { species: true } }),
      this.prisma.patient.groupBy({ by: ['status'], where: { workspaceId }, _count: { status: true } }),
    ]);

    return {
      total,
      bySpecies: bySpecies.map(s => ({ species: s.species, count: s._count.species })),
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count.status })),
    };
  }

  async getRecentActivity(workspaceId: string, limit: number = 20) {
    const [recentAppointments, recentInvoices, recentLabResults] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { workspaceId },
        include: { patient: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.invoice.findMany({
        where: { workspaceId },
        select: { id: true, invoiceNumber: true, total: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.labResult.findMany({
        where: { workspaceId },
        include: { patient: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    return { recentAppointments, recentInvoices, recentLabResults };
  }

  async getOverdueVaccinations(workspaceId: string): Promise<any[]> {
    const now = new Date();
    return this.prisma.vaccinationRecord.findMany({
      where: { workspaceId, nextDueDate: { lt: now } },
      include: { patient: { select: { id: true, name: true, ownerName: true, ownerPhone: true } } },
      orderBy: { nextDueDate: 'asc' },
      take: 50,
    });
  }

  async getPendingLabResults(workspaceId: string): Promise<any[]> {
    return this.prisma.labResult.findMany({
      where: { workspaceId, status: 'PENDING' },
      include: { patient: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
