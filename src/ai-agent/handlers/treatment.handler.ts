import { Injectable } from '@nestjs/common';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class TreatmentCommandHandler {
  async handle(p: ParsedCommand, _u: string, _w: string): Promise<AgentResult> {
    return {
      success: true,
      action: 'TREATMENT_RECOMMEND',
      message: 'Treatment recommendations based on evidence.',
      data: { query: p.originalText },
    };
  }
}