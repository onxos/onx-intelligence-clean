import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiRouterService, AICompletionContext } from './ai-router.service';

describe('AiRouterService', () => {
  let service: AiRouterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiRouterService, { provide: ConfigService, useValue: {} }],
    }).compile();

    service = module.get<AiRouterService>(AiRouterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('route', () => {
    it('should return placeholder response', async () => {
      const ctx: AICompletionContext = { domain: 'general' };
      const result = await service.route('Hello', ctx);
      expect(result.content).toContain('Placeholder');
      expect(result.mock).toBe(true);
    });

    it('should select provider by ID', async () => {
      const ctx: AICompletionContext = { domain: 'general' };
      const result = await service.route('Hello', ctx, 'openai');
      expect(result.provider).toBe('openai');
    });

    it('should compute a deterministic, non-random confidence score', async () => {
      const ctx: AICompletionContext = { domain: 'clinical' };
      const first = await service.route('diagnose this patient', ctx, 'anthropic');
      const second = await service.route('diagnose this patient', ctx, 'anthropic');
      expect(first.confidence).toBe(second.confidence);
      expect(first.confidence).toBeGreaterThanOrEqual(0);
      expect(first.confidence).toBeLessThanOrEqual(1);
    });

    it('should force local routing for sensitive queries', async () => {
      const ctx: AICompletionContext = { domain: 'clinical' };
      const result = await service.route('what is this patient SSN', ctx);
      expect(result.provider).toBe('ollama_local');
      expect(result.routingReason).toBe('PRIVACY_FORCED_LOCAL');
    });
  });

  describe('consensus', () => {
    it('should return consensus result', async () => {
      const ctx: AICompletionContext = { domain: 'clinical' };
      const result = await service.consensus('diagnosis?', ctx);
      expect(result.agreed).toBe(true);
      expect(result.responses.length).toBeGreaterThan(0);
    });
  });

  describe('chat', () => {
    it('should handle multi-turn', async () => {
      const ctx: AICompletionContext = { domain: 'general' };
      const messages = [{ role: 'user' as const, content: 'Hi' }];
      const result = await service.chat(messages, ctx);
      expect(result.content).toBeDefined();
    });
  });

  describe('listProviderInfo', () => {
    it('should return 7 providers including the local LLM', () => {
      const providers = service.listProviderInfo();
      expect(providers).toHaveLength(7);
      expect(providers.some((p) => p.name === 'ollama_local')).toBe(true);
    });
  });

  describe('providerStatus', () => {
    it('should return provider info', async () => {
      const status = await service.providerStatus('openai');
      expect(status).not.toBeNull();
      expect(status?.name).toBe('openai');
    });

    it('should return null for unknown provider', async () => {
      const status = await service.providerStatus('unknown');
      expect(status).toBeNull();
    });
  });
});
