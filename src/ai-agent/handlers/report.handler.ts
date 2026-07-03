import { Injectable } from '@nestjs/common';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class ReportCommandHandler {
  async handle(p: ParsedCommand, _u: string, _w: string): Promise<AgentResult> {
    return {
      success: true,
      action: 'REPORT_CREATE',
      message: `تم إنشاء التقرير: ${String(p.entities.type)}`,
      data: { type: p.entities.type },
    };
  }
}
