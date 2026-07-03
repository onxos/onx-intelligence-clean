import { Injectable } from '@nestjs/common';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class DiagnosisCommandHandler {
  async handle(p: ParsedCommand, _u: string, _w: string): Promise<AgentResult> {
    return {
      success: true,
      action: 'DIAGNOSIS_ASSIST',
      message: 'Diagnostic assistant ready. Please describe symptoms.',
      data: { query: p.originalText },
    };
  }
}