/**
 * ONX AI Agent — Personal Assistant Module
 * Executes natural language commands within ONX Intelligence
 *
 * Examples:
 *   "Create a report for clinic this week" → generates report
 *   "Send reminders for tomorrow's appointments" → sends WhatsApp/SMS
 *   "Check Dr. Ahmed's permissions" → returns RBAC info
 */

import { Module } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { AiAgentController } from './ai-agent.controller';
import { CommandParser } from './command.parser';
import { ReportCommandHandler } from './handlers/report.handler';
import { ReminderCommandHandler } from './handlers/reminder.handler';
import { RbacCommandHandler } from './handlers/rbac.handler';
import { AnalyticsCommandHandler } from './handlers/analytics.handler';
import { AiCoreModule } from '../ai-core/ai-core.module';

@Module({
  imports: [AiCoreModule],
  controllers: [AiAgentController],
  providers: [
    AiAgentService,
    CommandParser,
    ReportCommandHandler,
    ReminderCommandHandler,
    RbacCommandHandler,
    AnalyticsCommandHandler,
  ],
  exports: [AiAgentService],
})
export class AiAgentModule {}
