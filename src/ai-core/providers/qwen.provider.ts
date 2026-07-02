import { Injectable } from '@nestjs/common';
import { BaseAIProvider } from './base.provider';
import { getProviderConfig } from '../ai-core.config';

/** Qwen Max provider (DashScope OpenAI-compatible endpoint). */
@Injectable()
export class QwenProvider extends BaseAIProvider {
  constructor() {
    super(getProviderConfig('qwen')!);
  }
}
