import { ServiceUnavailableException } from '@nestjs/common';
import { AiRouterService } from './ai-router.service';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { QwenProvider } from './providers/qwen.provider';
import { LlamaProvider } from './providers/llama.provider';
import { AIProvider, AIResponse } from './ai-core.types';

describe('AiRouterService', () => {
  const makeRouter = () =>
    new AiRouterService(
      new OpenAIProvider(),
      new AnthropicProvider(),
      new GeminiProvider(),
      new DeepSeekProvider(),
      new QwenProvider(),
      new LlamaProvider(),
    );

  const fakeProvider = (name: string, priority: number, behavior: 'ok' | 'throw'): AIProvider => ({
    name,
    model: `${name}-model`,
    priority,
    evidenceTier: '4',
    isConfigured: () => false,
    isAvailable: async () => true,
    complete: async (): Promise<AIResponse> => {
      if (behavior === 'throw') throw new Error(`${name} down`);
      return {
        content: `answer from ${name}`,
        model: `${name}-model`,
        provider: name,
        tokensUsed: 5,
        latencyMs: 1,
        evidenceTier: '4',
        mock: true,
        timestamp: new Date(),
      };
    },
    chat: async (): Promise<AIResponse> => {
      if (behavior === 'throw') throw new Error(`${name} down`);
      return {
        content: `chat from ${name}`,
        model: `${name}-model`,
        provider: name,
        tokensUsed: 5,
        latencyMs: 1,
        evidenceTier: '4',
        mock: true,
        timestamp: new Date(),
      };
    },
  });

  it('registers all six providers sorted by priority', () => {
    const providers = makeRouter().listProviders();
    expect(providers).toHaveLength(6);
    expect(providers.map((p) => p.name)).toEqual([
      'openai',
      'anthropic',
      'gemini',
      'deepseek',
      'qwen',
      'llama',
    ]);
  });

  it('exposes provider info with mock mode when unconfigured', () => {
    const info = makeRouter().listProviderInfo();
    expect(info).toHaveLength(6);
    expect(info.every((p) => p.mode === 'mock')).toBe(true);
    expect(info[0]).toMatchObject({ name: 'openai', priority: 1, evidenceTier: '4' });
  });

  it('gets a provider by name (case-insensitive) and returns undefined otherwise', () => {
    const router = makeRouter();
    expect(router.getProvider('OpenAI')?.name).toBe('openai');
    expect(router.getProvider('missing')).toBeUndefined();
  });

  it('reports provider status', async () => {
    const status = await makeRouter().providerStatus('anthropic');
    expect(status).toMatchObject({ name: 'anthropic', available: true, configured: false });
  });

  it('returns undefined status for an unknown provider', async () => {
    await expect(makeRouter().providerStatus('nope')).resolves.toBeUndefined();
  });

  it('lists all providers as available in mock mode', async () => {
    await expect(makeRouter().availableProviders()).resolves.toHaveLength(6);
  });

  it('routes to the highest-priority provider by default', async () => {
    const res = await makeRouter().route('hello');
    expect(res.provider).toBe('openai');
  });

  it('honours a preferred provider', async () => {
    const res = await makeRouter().route('hello', undefined, 'llama');
    expect(res.provider).toBe('llama');
  });

  it('throws when no providers are available', async () => {
    const router = makeRouter();
    jest.spyOn(router, 'availableProviders').mockResolvedValue([]);
    await expect(router.route('hi')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fallbackChain skips a failing provider and returns the next success', async () => {
    const router = makeRouter();
    const res = await router.fallbackChain(
      [fakeProvider('down', 1, 'throw'), fakeProvider('up', 2, 'ok')],
      'q',
    );
    expect(res.provider).toBe('up');
  });

  it('fallbackChain throws when every provider fails', async () => {
    const router = makeRouter();
    await expect(
      router.fallbackChain([fakeProvider('a', 1, 'throw'), fakeProvider('b', 2, 'throw')], 'q'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reaches consensus when mock providers agree', async () => {
    const result = await makeRouter().consensus('shared question');
    expect(result.agreed).toBe(true);
    expect(result.agreementCount).toBeGreaterThanOrEqual(2);
    expect(result.totalConsulted).toBe(3);
    expect(result.consensusContent).not.toBeNull();
    expect(result.evidenceTier).toBe('4');
  });

  it('does not agree when responses diverge', async () => {
    const router = makeRouter();
    jest
      .spyOn(router, 'availableProviders')
      .mockResolvedValue([
        fakeProvider('a', 1, 'ok'),
        fakeProvider('b', 2, 'ok'),
        fakeProvider('c', 3, 'ok'),
      ]);
    const result = await router.consensus('q');
    expect(result.agreed).toBe(false);
    expect(result.consensusContent).toBeNull();
    expect(result.responses).toHaveLength(3);
  });

  it('chat routes through the best available provider', async () => {
    const res = await makeRouter().chat([{ role: 'user', content: 'hi' }]);
    expect(res.provider).toBe('openai');
    expect(res.content).toContain('hi');
  });

  it('chat throws when no providers are available', async () => {
    const router = makeRouter();
    jest.spyOn(router, 'availableProviders').mockResolvedValue([]);
    await expect(router.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
