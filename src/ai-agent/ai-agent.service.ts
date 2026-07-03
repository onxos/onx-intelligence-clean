/**
 * ONX AI Agent — Service
 * Receives natural language → parses intent → executes command → returns result
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AiRouterService } from '../ai-core/ai-router.service';
import { CommandParser, ParsedCommand } from './command.parser';
import { ReportCommandHandler } from './handlers/report.handler';
import { ReminderCommandHandler } from './handlers/reminder.handler';
import { RbacCommandHandler } from './handlers/rbac.handler';
import { AnalyticsCommandHandler } from './handlers/analytics.handler';

export interface AgentResult {
  success: boolean;
  action: string;
  message: string;
  data?: any;
  error?: string;
  evidence?: string[];
}

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly commandParser: CommandParser,
    private readonly reportHandler: ReportCommandHandler,
    private readonly reminderHandler: ReminderCommandHandler,
    private readonly rbacHandler: RbacCommandHandler,
    private readonly analyticsHandler: AnalyticsCommandHandler,
  ) {}

  /**
   * Main entry: user says something, agent does something
   */
  async executeCommand(
    naturalLanguage: string,
    userId: string,
    workspaceId: string,
  ): Promise<AgentResult> {
    this.logger.log(`Agent command from ${userId}: "${naturalLanguage}"`);

    try {
      // Step 1: Parse intent
      const parsed = await this.commandParser.parse(naturalLanguage, workspaceId);

      // Step 2: Route to handler
      switch (parsed.intent) {
        case 'REPORT_CREATE':
          return this.reportHandler.handle(parsed, userId, workspaceId);

        case 'REMINDER_SEND':
          return this.reminderHandler.handle(parsed, userId, workspaceId);

        case 'RBAC_CHECK':
        case 'RBAC_ASSIGN':
          return this.rbacHandler.handle(parsed, userId, workspaceId);

        case 'ANALYTICS_QUERY':
          return this.analyticsHandler.handle(parsed, userId, workspaceId);

        case 'UNKNOWN':
        default:
          // Fall back to AI chat
          const aiResponse = await this.aiRouter.route({
            message: naturalLanguage,
            workspaceId,
            context: { type: 'agent_fallback', userId },
          });
          return {
            success: true,
            action: 'AI_CHAT',
            message: aiResponse.content,
          };
      }
    } catch (error) {
      this.logger.error(`Agent execution failed: ${error.message}`);
      return {
        success: false,
        action: 'ERROR',
        message: 'Failed to execute command. Please try again or contact support.',
        error: error.message,
      };
    }
  }

  /**
   * Get command history for a user
   */
  async getCommandHistory(userId: string, workspaceId: string, limit = 20) {
    return this.prisma.agentLog.findMany({
      where: { userId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
