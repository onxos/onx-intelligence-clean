/**
 * ONX AI Agent — Analytics Command Handler (Simplified for R1)
 * Uses IntelligenceObject and Report models (existing)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
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

      // Use IntelligenceObject and Report as data sources
      const [totalObjects, thisMonthObjects, totalReports, thisMonthReports] = await Promise.all([
        this.prisma.intelligenceObject.count({ where: { workspaceId } }),
        this.prisma.intelligenceObject.count({ where: { workspaceId, createdAt: { gte: monthStart } } }),
        this.prisma.report.count({ where: { workspaceId } }),
        this.prisma.report.count({ where: { workspaceId, createdAt: { gte: monthStart } } }),
      ]);

      const data: any = {
        intelligenceObjects: { total: totalObjects, thisMonth: thisMonthObjects },
        reports: { total: totalReports, thisMonth: thisMonthReports },
        workspaceId,
        generatedAt: now.toISOString(),
        note: 'Full clinical analytics (Patient/Appointment/Revenue) require Phase R3 (Clinical Core)',
      };

      return {
        success: true,
        action: 'ANALYTICS_QUERY',
        message: this.formatMessage(metric, data),
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

  private formatMessage(metric: string, data: any): string {
    if (metric === 'patient_count') {
      return `Intelligence objects: ${data.intelligenceObjects.total} total (${data.intelligenceObjects.thisMonth} this month). Full patient analytics in Phase R3.`;
    }
    if (metric === 'revenue') {
      return `Reports generated: ${data.reports.total} total (${data.reports.thisMonth} this month). Full revenue analytics in Phase R3.`;
    }
    return `Summary: ${data.intelligenceObjects.total} intelligence objects, ${data.reports.total} reports. Phase R3 for clinical metrics.`;
  }
}
