import {
  FRONTIER_MODELS,
  classifyOutput,
  detectArchitectureDrift,
  hasOnxIdentity,
  isModelCompliant,
} from './sfis.constants';
import { SfisService } from './sfis.service';

describe('SFIS detection engine (HC-05 / HC-06)', () => {
  it('monitors the 6 frontier models', () => {
    expect([...FRONTIER_MODELS]).toEqual(['gpt', 'claude', 'gemini', 'deepseek', 'qwen', 'llama']);
  });

  it('model compliance requires available + configValid', () => {
    expect(isModelCompliant('available', true)).toBe(true);
    expect(isModelCompliant('available', false)).toBe(false);
    expect(isModelCompliant('degraded', true)).toBe(false);
  });

  describe('L1 classifyOutput', () => {
    it('REJECTS an explicit commodity proposedCategory', () => {
      const out = classifyOutput('A helpful assistant', 'chatbot');
      expect(out.verdict).toBe('REJECT');
      expect(out.detectedCategory).toBe('chatbot');
    });

    it('REJECTS text converging to a RAG platform', () => {
      const out = classifyOutput('This is a retrieval-only RAG platform for docs.');
      expect(out.verdict).toBe('REJECT');
      expect(out.detectedCategory).toContain('rag');
    });

    it('REJECTS a vector DB convergence', () => {
      const out = classifyOutput('Just a vector database that stores embeddings.');
      expect(out.verdict).toBe('REJECT');
    });

    it('FLAGS generic AI branding without ONX identity', () => {
      const out = classifyOutput('Our smart, AI-powered platform.');
      expect(out.verdict).toBe('FLAG');
      expect(out.detectedCategory).toBe('generic');
    });

    it('PASSES generic wording when ONX identity is present (no false positive)', () => {
      const out = classifyOutput(
        'ONX institutional intelligence: an intelligent, AI-powered founder intent engine.',
      );
      expect(out.verdict).toBe('PASS');
    });

    it('PASSES a legitimate ONX institutional output', () => {
      const out = classifyOutput(
        'ONX promoted a constitutional judgment via the decision ladder into IURG.',
      );
      expect(out.verdict).toBe('PASS');
      expect(hasOnxIdentity('ONX judgment')).toBe(true);
    });
  });

  describe('L2 detectArchitectureDrift', () => {
    it('REJECTS an architecture reduced to a decision support tool', () => {
      const out = detectArchitectureDrift(
        'Reduce ONX to a decision support tool with recommendations-only.',
      );
      expect(out.verdict).toBe('REJECT');
      expect(out.layer).toBe('L2');
      expect(out.driftScore).toBeGreaterThan(0);
    });

    it('PASSES an institutional architecture', () => {
      const out = detectArchitectureDrift(
        'ONX institutional understanding graph with founder intent enforcement.',
      );
      expect(out.verdict).toBe('PASS');
    });
  });
});

describe('SfisService', () => {
  const makeService = () => {
    const store: any[] = [];
    const models = new Map<string, any>();
    const prisma = {
      sfisScanRecord: {
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `scan-${store.length + 1}`, scanId: `SC-${store.length + 1}`, ...data };
          store.push(row);
          return row;
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _avg: { driftScore: null } }),
      },
      sfisModelStatus: {
        findMany: jest.fn(async () => [...models.values()]),
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const key = where.workspaceId_modelName.modelName;
          const row = { ...(models.get(key) ?? create), ...update, modelName: key };
          models.set(key, row);
          return row;
        }),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const iurg = {
      bindFicEvent: jest.fn().mockResolvedValue({ node: { id: 'iurg-1', iurgId: 'IURG-x' } }),
    } as any;
    const service = new SfisService(prisma, audit, iurg);
    return { prisma, audit, iurg, service, store, models };
  };

  beforeEach(() => jest.clearAllMocks());

  it('scan REJECT: logs an HC-05 violation to IURG and records the scan', async () => {
    const { service, iurg, prisma } = makeService();
    const out = await service.scan('ws-1', 'user-1', {
      outputText: 'just a chatbot',
      outputType: 'output',
    });
    expect(out.verdict).toBe('REJECT');
    expect(iurg.bindFicEvent).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'REJECTED', hardViolations: ['HC-05'] }),
    );
    expect(out.iurgNodeId).toBe('iurg-1');
    expect(prisma.sfisScanRecord.create).toHaveBeenCalledTimes(1);
  });

  it('scan FLAG: generic branding is flagged without an IURG violation', async () => {
    const { service, iurg } = makeService();
    const out = await service.scan('ws-1', 'user-1', { outputText: 'smart AI-powered tool' });
    expect(out.verdict).toBe('FLAG');
    expect(iurg.bindFicEvent).not.toHaveBeenCalled();
  });

  it('scan PASS: ONX-specific output passes', async () => {
    const { service } = makeService();
    const out = await service.scan('ws-1', 'user-1', {
      outputText: 'ONX institutional judgment via the decision ladder.',
    });
    expect(out.verdict).toBe('PASS');
  });

  it('scan architecture routes to L2 drift', async () => {
    const { service } = makeService();
    const out = await service.scan('ws-1', 'user-1', {
      outputText: 'Reduce ONX to a RAG platform, retrieval-only.',
      outputType: 'architecture',
    });
    expect(out.layer).toBe('L2');
    expect(out.verdict).toBe('REJECT');
  });

  it('checkModels: all available -> not blocked', async () => {
    const { service } = makeService();
    const out = await service.checkModels('ws-1', 'user-1', undefined);
    expect(out.blocked).toBe(false);
    expect(out.compliantCount).toBe(6);
  });

  it('checkModels: a missing model -> blocked + HC-06 IURG violation', async () => {
    const { service, iurg } = makeService();
    const out = await service.checkModels('ws-1', 'user-1', {
      models: [{ modelName: 'llama', status: 'unavailable', configValid: false }],
    });
    expect(out.blocked).toBe(true);
    expect(out.compliantCount).toBe(5);
    expect(iurg.bindFicEvent).toHaveBeenCalledWith(
      expect.objectContaining({ hardViolations: ['HC-06'] }),
    );
  });

  it('startupCheck: blocks when no models are configured', async () => {
    const { service, iurg } = makeService();
    const out = await service.startupCheck('ws-1', 'user-1');
    expect(out.blocked).toBe(true);
    expect(out.missing).toEqual([...FRONTIER_MODELS]);
    expect(iurg.bindFicEvent).toHaveBeenCalledWith(
      expect.objectContaining({ hardViolations: ['HC-06'] }),
    );
  });

  it('startupCheck: passes after all models are checked available', async () => {
    const { service } = makeService();
    await service.checkModels('ws-1', 'user-1', undefined);
    const out = await service.startupCheck('ws-1', 'user-1');
    expect(out.blocked).toBe(false);
    expect(out.compliantCount).toBe(6);
  });

  it('listModels always returns all 6 frontier models', async () => {
    const { service } = makeService();
    const out = await service.listModels('ws-1');
    expect(out.total).toBe(6);
    expect(out.models).toHaveLength(6);
  });

  it('getStatus reflects HC-06 compliance', async () => {
    const { service } = makeService();
    await service.checkModels('ws-1', 'user-1', undefined);
    const out = await service.getStatus('ws-1');
    expect(out.hc06Compliant).toBe(true);
    expect(out.startupBlocked).toBe(false);
  });
});
