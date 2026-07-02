import { Injectable } from '@nestjs/common';
import { BaseAIProvider } from './base.provider';
import { getProviderConfig } from '../ai-core.config';

/** DeepSeek Chat provider (OpenAI-compatible). */
@Injectable()
export class DeepSeekProvider extends BaseAIProvider {
  constructor() {
    super(getProviderConfig('deepseek')!);
  }
}
