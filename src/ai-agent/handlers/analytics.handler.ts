import { Injectable } from '@nestjs/common';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class AnalyticsCommandHandler {
  async handle(p: ParsedCommand, _u: string, _w: string): Promise<AgentResult> {
    return {
      success: true,
      action: 'ANALYTICS_QUERY',
      message: `الإحصائيات: ${String(p.entities.metric)}`,
      data: { metric: p.entities.metric },
    };
  }
}
