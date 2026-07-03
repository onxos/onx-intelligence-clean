import { Injectable } from '@nestjs/common';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class ImageCommandHandler {
  async handle(p: ParsedCommand, _u: string, _w: string): Promise<AgentResult> {
    return {
      success: true,
      action: 'IMAGE_ANALYSIS',
      message: 'Image analysis requires an uploaded image.',
      data: { query: p.originalText },
    };
  }
}