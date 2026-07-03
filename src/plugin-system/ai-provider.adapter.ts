/**
 * ONX Plugin System — AI Provider Adapter
 * Wraps plugin-based AI providers into the existing AiRouterService
 */

import { Injectable } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { ChatMessage } from './plugin.interface';

@Injectable()
export class AIProviderAdapter {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}

  /**
   * Chat using a plugin-based provider
   */
  async chat(providerId: string, messages: ChatMessage[], config?: any): Promise<any> {
    const plugin = this.pluginRegistry.get(providerId);
    if (!plugin || plugin.type !== 'AI_PROVIDER') {
      throw new Error(`AI provider plugin ${providerId} not found or not an AI provider`);
    }

    const provider = plugin as any;
    return provider.chat(messages, config);
  }

  /**
   * Get all available AI providers (built-in + plugins)
   */
  getAllProviders(): { id: string; name: string; status: string; type: string }[] {
    const pluginProviders = this.pluginRegistry
      .getAIProviders()
      .map(p => ({ id: p.id, name: p.name, status: p.status, type: 'plugin' }));

    // Built-in providers are returned separately by AiRouterService
    return pluginProviders;
  }
}
