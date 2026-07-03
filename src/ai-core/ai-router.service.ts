/**
 * ONX AI Router — Placeholder
 * Routes AI requests to appropriate providers
 * Full implementation in Phase R3 (AI Integration Core)
 */

import { Injectable, Logger } from '@nestjs/common';

export interface RouteOptions {
  message: string;
  workspaceId: string;
  context?: Record<string, any>;
  provider?: string;
}

export interface RouteResult {
  content: string;
  model?: string;
  provider?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason?: string;
}

@Injectable()
export class AiRouterService {
  private readonly logger = new Logger(AiRouterService.name);

  async route(options: RouteOptions): Promise<RouteResult> {
    this.logger.log(`Routing AI request for workspace: ${options.workspaceId}`);

    // Phase R1: Placeholder — returns mock response
    // Phase R3: Will route to GPT-4o, Claude, Gemini, DeepSeek, Qwen based on ISES score
    return {
      content: `[AI Placeholder] Received: "${options.message}". Full AI integration in Phase R3.`,
      model: 'placeholder',
      provider: 'none',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: 'placeholder',
    };
  }

  /**
   * Check if AI routing is available
   */
  isAvailable(): boolean {
    return true; // Always available as placeholder
  }
}
