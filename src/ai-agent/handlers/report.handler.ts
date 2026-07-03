/**
 * ONX AI Agent — Report Command Handler (Simplified for R1)
 * Uses Report model (existing) instead of Patient/Appointment/Invoice
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
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

    try {
      // Count existing reports as baseline
      const totalReports = await this.prisma.report.count({ where: { workspaceId } });
      const recentReports = await this.prisma.report.count({
        where: { workspaceId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      });

      const reportData = {
        type: reportType,
        dateRange,
        totalReports,
        recentReports,
        generatedAt: new Date().toISOString(),
        note: 'Full clinical reports (Patient/Appointment/Billing) require Phase R3 (Clinical Core)',
      };

      // Store report record
      const report = await this.prisma.report.create({
        data: {
          title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report (${dateRange})`,
          type: reportType,
          workspaceId,
          createdBy: userId,
          data: reportData,
          dateRange,
        },
      });

      return {
        success: true,
        action: 'REPORT_CREATE',
        message: `Report #${report.id} generated successfully (${reportType}).`,
        data: reportData,
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
}
