import { Injectable, Logger } from '@nestjs/common';
import { CommandParser } from './command.parser';
import { ReportCommandHandler } from './handlers/report.handler';
import { ReminderCommandHandler } from './handlers/reminder.handler';
import { RbacCommandHandler } from './handlers/rbac.handler';
import { AnalyticsCommandHandler } from './handlers/analytics.handler';

export interface AgentResult {
  success: boolean;
  action: string;
  message: string;
  data?: unknown;
  error?: string;
}

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    private readonly parser: CommandParser,
    private readonly report: ReportCommandHandler,
    private readonly reminder: ReminderCommandHandler,
    private readonly rbac: RbacCommandHandler,
    private readonly analytics: AnalyticsCommandHandler,
  ) {}

  async executeCommand(text: string, userId: string, wsId: string): Promise<AgentResult> {
    try {
      const p = await this.parser.parse(text, wsId);
      switch (p.intent) {
        case 'REPORT_CREATE':
          return this.report.handle(p, userId, wsId);
        case 'REMINDER_SEND':
          return this.reminder.handle(p, userId, wsId);
        case 'RBAC_CHECK':
        case 'RBAC_ASSIGN':
          return this.rbac.handle(p, userId, wsId);
        case 'ANALYTICS_QUERY':
          return this.analytics.handle(p, userId, wsId);
        default:
          return { success: false, action: 'UNKNOWN', message: 'لم أفهم الأمر' };
      }
    } catch (e) {
      const error = e as Error;
      this.logger.error('AI agent command execution failed', error.stack);
      return {
        success: false,
        action: 'ERROR',
        message: 'فشل التنفيذ',
        error: error.message,
      };
    }
  }
}
