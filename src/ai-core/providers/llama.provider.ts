import { Injectable } from '@nestjs/common';
import { BaseAIProvider } from './base.provider';
import { getProviderConfig } from '../ai-core.config';

/**
 * Llama 3.1 provider via a local Ollama OpenAI-compatible server. Configured by
 * OLLAMA_BASE_URL; falls back to deterministic mock when the server is absent.
 */
@Injectable()
export class LlamaProvider extends BaseAIProvider {
  constructor() {
    super(getProviderConfig('llama')!);
  }
}
