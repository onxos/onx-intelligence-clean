/**
 * ONX AI Agent — Analytics Command Handler
 * "How many patients this month?" → returns statistics
 * "What is the revenue trend?" → returns analytics
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class AnalyticsCommandHandler {
  private readonly logger = new Logger(AnalyticsCommandHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(
    parsed: ParsedCommand,
    _userId: string,
    workspaceId: string,
  ): Promise<AgentResult> {
    const { entities } = parsed;
    const metric = entities.metric ?? 'summary';

    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      let data: any;

      switch (metric) {
        case 'patient_count':
          data = await this.getPatientAnalytics(workspaceId, monthStart, lastMonthStart, lastMonthEnd);
          break;
        case 'appointment_count':
          data = await this.getAppointmentAnalytics(workspaceId, monthStart, lastMonthStart, lastMonthEnd);
          break;
        case 'revenue':
          data = await this.getRevenueAnalytics(workspaceId, monthStart, lastMonthStart, lastMonthEnd);
          break;
        case 'utilization':
          data = await this.getUtilizationAnalytics(workspaceId, monthStart);
          break;
        default:
          const [patients, appointments, revenue] = await Promise.all([
            this.getPatientAnalytics(workspaceId, monthStart, lastMonthStart, lastMonthEnd),
            this.getAppointmentAnalytics(workspaceId, monthStart, lastMonthStart, lastMonthEnd),
            this.getRevenueAnalytics(workspaceId, monthStart, lastMonthStart, lastMonthEnd),
          ]);
          data = { patients, appointments, revenue };
      }

      return {
        success: true,
        action: 'ANALYTICS_QUERY',
        message: this.formatAnalyticsMessage(metric, data),
        data,
      };
    } catch (error) {
      this.logger.error(`Analytics query failed: ${error.message}`);
      return {
        success: false,
        action: 'ANALYTICS_QUERY',
        message: 'Failed to retrieve analytics.',
        error: error.message,
      };
    }
  }

  private async getPatientAnalytics(
    workspaceId: string,
    thisMonth: Date,
    lastMonthStart: Date,
    lastMonthEnd: Date,
  ) {
    const [thisMonthCount, lastMonthCount, total] = await Promise.all([
      this.prisma.patient.count({ where: { workspaceId, createdAt: { gte: thisMonth } } }),
      this.prisma.patient.count({ where: { workspaceId, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      this.prisma.patient.count({ where: { workspaceId } }),
    ]);

    const change = lastMonthCount === 0 ? 100 : ((thisMonthCount - lastMonthCount) / lastMonthCount * 100).toFixed(1);

    return { thisMonth: thisMonthCount, lastMonth: lastMonthCount, total, changePercent: `${change}%` };
  }

  private async getAppointmentAnalytics(
    workspaceId: string,
    thisMonth: Date,
    lastMonthStart: Date,
    lastMonthEnd: Date,
  ) {
    const [thisMonthCount, lastMonthCount, byStatus] = await Promise.all([
      this.prisma.appointment.count({ where: { workspaceId, createdAt: { gte: thisMonth } } }),
      this.prisma.appointment.count({ where: { workspaceId, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { workspaceId, createdAt: { gte: thisMonth } },
        _count: true,
      }),
    ]);

    return { thisMonth: thisMonthCount, lastMonth: lastMonthCount, byStatus };
  }

  private async getRevenueAnalytics(
    workspaceId: string,
    thisMonth: Date,
    lastMonthStart: Date,
    lastMonthEnd: Date,
  ) {
    const [thisMonthRevenue, lastMonthRevenue] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { workspaceId, createdAt: { gte: thisMonth }, status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { workspaceId, createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    const thisAmount = thisMonthRevenue._sum.amount ?? 0;
    const lastAmount = lastMonthRevenue._sum.amount ?? 0;
    const change = lastAmount === 0 ? 100 : ((thisAmount - lastAmount) / lastAmount * 100).toFixed(1);

    return { thisMonth: thisAmount, lastMonth: lastAmount, changePercent: `${change}%`, currency: 'USD' };
  }

  private async getUtilizationAnalytics(workspaceId: string, monthStart: Date) {
    const [totalSlots, bookedSlots] = await Promise.all([
      this.prisma.appointmentSlot.count({ where: { workspaceId, date: { gte: monthStart } } }),
      this.prisma.appointment.count({ where: { workspaceId, createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } } }),
    ]);

    const rate = totalSlots === 0 ? 0 : ((bookedSlots / totalSlots) * 100).toFixed(1);
    return { totalSlots, bookedSlots, utilizationRate: `${rate}%` };
  }

  private formatAnalyticsMessage(metric: string, data: any): string {
    if (metric === 'patient_count') {
      return `This month: ${data.thisMonth} new patients (${data.changePercent} vs last month). Total: ${data.total}.`;
    }
    if (metric === 'appointment_count') {
      return `This month: ${data.thisMonth} appointments (last month: ${data.lastMonth}).`;
    }
    if (metric === 'revenue') {
      return `This month revenue: $${data.thisMonth} (${data.changePercent} vs last month).`;
    }
    return `Analytics summary: ${JSON.stringify(data).slice(0, 200)}...`;
  }
}
