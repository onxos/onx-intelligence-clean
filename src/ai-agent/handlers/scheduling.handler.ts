import { Injectable } from '@nestjs/common';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class SchedulingCommandHandler {
  async handle(p: ParsedCommand, _u: string, _w: string): Promise<AgentResult> {
    return {
      success: true,
      action: 'SCHEDULING_OPTIMIZE',
      message: 'Schedule optimization suggestions.',
      data: { query: p.originalText },
    };
  }
}