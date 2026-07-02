import { Module } from '@nestjs/common';
import { SechModule } from '../sech/sech.module';
import { IurgModule } from '../iurg/iurg.module';
import { AiCoreController } from './ai-core.controller';
import { AiCoreService } from './ai-core.service';
import { AiRouterService } from './ai-router.service';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { QwenProvider } from './providers/qwen.provider';
import { LlamaProvider } from './providers/llama.provider';

@Module({
  imports: [SechModule, IurgModule],
  controllers: [AiCoreController],
  providers: [
    AiCoreService,
    AiRouterService,
    OpenAIProvider,
    AnthropicProvider,
    GeminiProvider,
    DeepSeekProvider,
    QwenProvider,
    LlamaProvider,
  ],
  exports: [AiCoreService, AiRouterService],
})
export class AiCoreModule {}
