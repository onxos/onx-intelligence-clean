import { Injectable } from '@nestjs/common';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class CommunicationCommandHandler {
  async handle(p: ParsedCommand, _u: string, _w: string): Promise<AgentResult> {
    return {
      success: true,
      action: 'CLIENT_COMMUNICATION',
      message: 'Communication prepared.',
      data: { type: p.entities.type || 'message' },
    };
  }
}