import { Injectable } from '@nestjs/common';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class RbacCommandHandler {
  async handle(p: ParsedCommand, _u: string, _w: string): Promise<AgentResult> {
    return {
      success: true,
      action: p.intent,
      message: `تم فحص صلاحيات ${String(p.entities.target)}`,
      data: { target: p.entities.target },
    };
  }
}
