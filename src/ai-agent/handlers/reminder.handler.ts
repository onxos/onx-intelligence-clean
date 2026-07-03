import { Injectable } from '@nestjs/common';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class ReminderCommandHandler {
  async handle(p: ParsedCommand, _u: string, _w: string): Promise<AgentResult> {
    return {
      success: true,
      action: 'REMINDER_SEND',
      message: `تم إرسال تذكير ${String(p.entities.type)}`,
      data: { type: p.entities.type },
    };
  }
}
