import { OpenAIProvider } from './openai.provider';
import { LlamaProvider } from './llama.provider';
import { estimateTokens } from './base.provider';

describe('BaseAIProvider (via OpenAIProvider)', () => {
  const provider = new OpenAIProvider();

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('exposes config metadata', () => {
    expect(provider.name).toBe('openai');
    expect(provider.model).toBe('gpt-4o');
    expect(provider.priority).toBe(1);
    expect(provider.evidenceTier).toBe('4');
  });

  it('is not configured without an API key', () => {
    expect(provider.isConfigured()).toBe(false);
  });

  it('reports configured when the API key env is present', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(provider.isConfigured()).toBe(true);
  });

  it('is always available (mock fallback)', async () => {
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it('returns a deterministic MOCK response from complete()', async () => {
    const res = await provider.complete('What is FIC?');
    expect(res.mock).toBe(true);
    expect(res.content.startsWith('MOCK:')).toBe(true);
    expect(res.provider).toBe('openai');
    expect(res.model).toBe('gpt-4o');
    expect(res.evidenceTier).toBe('4');
    expect(res.timestamp).toBeInstanceOf(Date);
  });

  it('produces identical mock content for identical prompts (consensus-friendly)', async () => {
    const a = await provider.complete('same prompt');
    const b = await provider.complete('same prompt');
    expect(a.content).toBe(b.content);
  });

  it('produces different mock content for different prompts', async () => {
    const a = await provider.complete('prompt one');
    const b = await provider.complete('prompt two');
    expect(a.content).not.toBe(b.content);
  });

  it('counts tokens and latency', async () => {
    const res = await provider.complete('estimate my tokens please');
    expect(res.tokensUsed).toBeGreaterThan(0);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('chat() folds the last user message into the mock', async () => {
    const res = await provider.chat([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hello world' },
    ]);
    expect(res.mock).toBe(true);
    expect(res.content).toContain('hello world');
  });

  it('different providers share the same mock core for the same prompt', async () => {
    const llama = new LlamaProvider();
    const a = await provider.complete('shared core');
    const b = await llama.complete('shared core');
    expect(a.content).toBe(b.content);
    expect(a.provider).not.toBe(b.provider);
  });

  it('estimateTokens is monotonic and never zero', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});
