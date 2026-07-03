/**
 * ONX AI Agent — Report Command Handler
 * "Create a report for clinic this week" → generates report
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class ReportCommandHandler {
  private readonly logger = new Logger(ReportCommandHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(
    parsed: ParsedCommand,
    userId: string,
    workspaceId: string,
  ): Promise<AgentResult> {
    const { entities } = parsed;
    const reportType = entities.reportType ?? 'summary';
    const dateRange = entities.dateRange ?? 'this_week';

    const { startDate, endDate } = this.resolveDateRange(dateRange);

    try {
      let data: any;
      let title: string;

      switch (reportType) {
        case 'patients':
          data = await this.getPatientReport(workspaceId, startDate, endDate);
          title = `Patient Report (${dateRange})`;
          break;
        case 'appointments':
          data = await this.getAppointmentReport(workspaceId, startDate, endDate);
          title = `Appointment Report (${dateRange})`;
          break;
        case 'billing':
          data = await this.getBillingReport(workspaceId, startDate, endDate);
          title = `Billing Report (${dateRange})`;
          break;
        default:
          data = await this.getSummaryReport(workspaceId, startDate, endDate);
          title = `Clinic Summary (${dateRange})`;
      }

      // Store report record
      await this.prisma.report.create({
        data: {
          title,
          type: reportType,
          workspaceId,
          createdBy: userId,
          data,
          dateRange: `${startDate.toISOString()}_${endDate.toISOString()}`,
        },
      });

      return {
        success: true,
        action: 'REPORT_CREATE',
        message: `Report "${title}" generated successfully.`,
        data: { title, type: reportType, ...data },
      };
    } catch (error) {
      this.logger.error(`Report generation failed: ${error.message}`);
      return {
        success: false,
        action: 'REPORT_CREATE',
        message: 'Failed to generate report.',
        error: error.message,
      };
    }
  }

  private resolveDateRange(range: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    switch (range) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'this_week':
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'this_month':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last_month':
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    return { startDate, endDate };
  }

  private async getPatientReport(workspaceId: string, start: Date, end: Date) {
    const [total, newPatients, bySpecies] = await Promise.all([
      this.prisma.patient.count({ where: { workspaceId } }),
      this.prisma.patient.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } }),
      this.prisma.patient.groupBy({
        by: ['species'],
        where: { workspaceId },
        _count: true,
      }),
    ]);
    return { total, newPatients, period: `${start.toDateString()} - ${end.toDateString()}`, bySpecies };
  }

  private async getAppointmentReport(workspaceId: string, start: Date, end: Date) {
    const [total, completed, cancelled, upcoming] = await Promise.all([
      this.prisma.appointment.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { workspaceId, status: 'COMPLETED', createdAt: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { workspaceId, status: 'CANCELLED', createdAt: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { workspaceId, status: 'SCHEDULED', date: { gte: new Date() } } }),
    ]);
    return { total, completed, cancelled, upcoming };
  }

  private async getBillingReport(workspaceId: string, start: Date, end: Date) {
    const invoices = await this.prisma.invoice.aggregate({
      where: { workspaceId, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: true,
    });
    return { totalRevenue: invoices._sum.amount ?? 0, invoiceCount: invoices._count };
  }

  private async getSummaryReport(workspaceId: string, start: Date, end: Date) {
    const [patients, appointments, billing] = await Promise.all([
      this.getPatientReport(workspaceId, start, end),
      this.getAppointmentReport(workspaceId, start, end),
      this.getBillingReport(workspaceId, start, end),
    ]);
    return { patients, appointments, billing };
  }
}
