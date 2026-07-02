import { Injectable } from '@nestjs/common';
import { BaseAIProvider } from './base.provider';
import { getProviderConfig } from '../ai-core.config';

/** OpenAI GPT-4o provider (OpenAI-compatible). */
@Injectable()
export class OpenAIProvider extends BaseAIProvider {
  constructor() {
    super(getProviderConfig('openai')!);
  }
}
