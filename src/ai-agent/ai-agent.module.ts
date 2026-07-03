import { Module } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { AiAgentController } from './ai-agent.controller';
import { CommandParser } from './command.parser';
import { ReportCommandHandler } from './handlers/report.handler';
import { ReminderCommandHandler } from './handlers/reminder.handler';
import { RbacCommandHandler } from './handlers/rbac.handler';
import { AnalyticsCommandHandler } from './handlers/analytics.handler';

@Module({
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
