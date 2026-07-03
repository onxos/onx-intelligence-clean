import { Module } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { AiAgentController } from './ai-agent.controller';
import { CommandParser } from './command.parser';
import { ReportCommandHandler } from './handlers/report.handler';
import { ReminderCommandHandler } from './handlers/reminder.handler';
import { RbacCommandHandler } from './handlers/rbac.handler';
import { AnalyticsCommandHandler } from './handlers/analytics.handler';
import { DiagnosisCommandHandler } from './handlers/diagnosis.handler';
import { TreatmentCommandHandler } from './handlers/treatment.handler';
import { ImageCommandHandler } from './handlers/image.handler';
import { SchedulingCommandHandler } from './handlers/scheduling.handler';
import { CommunicationCommandHandler } from './handlers/communication.handler';

@Module({
  controllers: [AiAgentController],
  providers: [
    AiAgentService,
    CommandParser,
    ReportCommandHandler,
    ReminderCommandHandler,
    RbacCommandHandler,
    AnalyticsCommandHandler,
    DiagnosisCommandHandler,
    TreatmentCommandHandler,
    ImageCommandHandler,
    SchedulingCommandHandler,
    CommunicationCommandHandler,
  ],
  exports: [AiAgentService],
})
export class AiAgentModule {}
