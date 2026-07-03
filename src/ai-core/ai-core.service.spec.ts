import { NotFoundException } from '@nestjs/common';
import { AiCoreService } from './ai-core.service';
import { CLINICAL_SYSTEM_PROMPT } from './prompts/clinical.prompts';
import { AIResponse } from './ai-core.types';

describe('AiCoreService', () => {
  const aiResponse = (overrides: Partial<AIResponse> = {}): AIResponse => ({
    content: 'MOCK: structured answer',
    model: 'gpt-4o',
    provider: 'openai',
    tokensUsed: 42,
    latencyMs: 7,
    evidenceTier: '4',
    timestamp: new Date(),
    ...overrides,
  });

  const makeService = () => {
    const prisma = {
      aIQueryLog: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ ...data })),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const router = {
      route: jest.fn().mockResolvedValue(aiResponse()),
      chat: jest.fn().mockResolvedValue(aiResponse({ content: 'MOCK: chat answer' })),
      consensus: jest.fn().mockResolvedValue({
        agreed: true,
        agreementCount: 3,
        totalConsulted: 3,
        consensusContent: 'MOCK: agreed',
        evidenceTier: '4',
        responses: [
          aiResponse(),
          aiResponse({ provider: 'anthropic' }),
          aiResponse({ provider: 'google' }),
        ],
      }),
      listProviderInfo: jest.fn().mockReturnValue([{ name: 'openai', mode: 'mock' }]),
      providerStatus: jest.fn(),
    } as any;
    const sech = { route: jest.fn() } as any;
    const iurg = {
      findNodeBySourceCheck: jest.fn().mockResolvedValue({ id: 'node-1', nodeType: 'ENFORCEMENT' }),
    } as any;
    const service = new AiCoreService(prisma, audit, router, sech, iurg);
    return { prisma, audit, router, sech, iurg, service };
  };

  const approvedRoute = (overrides: Record<string, unknown> = {}) => ({
    id: 'sr-1',
    status: 'APPROVED',
    counterProposal: null,
    requiresHumanApproval: false,
    gateResults: [{ checkType: 'pre_execution', checkId: 'fic-1' }],
    ...overrides,
  });

  beforeEach(() => jest.clearAllMocks());

  it('query: approved path routes to a provider and logs with FIC/IURG refs', async () => {
    const { service, sech, router, prisma, audit } = makeService();
    sech.route.mockResolvedValue(approvedRoute());

    const result = await service.query('ws-1', 'user-1', { query: 'What is FIC?' });

    expect(router.route).toHaveBeenCalled();
    expect(result.status).toBe('approved');
    expect(result.response).toBe('MOCK: structured answer');
    expect(result).toMatchObject({
      ficStatus: 'APPROVED',
      ficCheckId: 'fic-1',
      sechRouteId: 'sr-1',
      iurgNodeId: 'node-1',
    });
    expect(prisma.aIQueryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ficStatus: 'APPROVED',
          ficCheckId: 'fic-1',
          sechRouteId: 'sr-1',
          iurgNodeId: 'node-1',
          providerUsed: 'openai',
          evidenceTier: '4',
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AI_QUERY_APPROVED' }),
    );
  });

  it('query: passes the SECH pre_execution gate with the domain and signals', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(approvedRoute());
    await service.query('ws-1', 'user-1', {
      query: 'q',
      domain: 'Clinical',
      signals: { emergencyMedical: true },
    });
    expect(sech.route).toHaveBeenCalledWith(
      'ws-1',
      'user-1',
      expect.objectContaining({
        checkType: 'pre_execution',
        domains: ['clinical'],
        signals: { emergencyMedical: true },
      }),
      undefined,
    );
  });

  it('query: REJECTED returns a counter-proposal and never calls the model', async () => {
    const { service, sech, router, audit } = makeService();
    sech.route.mockResolvedValue(
      approvedRoute({ status: 'REJECTED', counterProposal: 'Reduce scope and resubmit.' }),
    );

    const result = await service.query('ws-1', 'user-1', { query: 'do a bad thing' });

    expect(router.route).not.toHaveBeenCalled();
    expect(result.status).toBe('rejected');
    expect(result.response).toBeNull();
    expect((result as any).counterProposal).toBe('Reduce scope and resubmit.');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AI_QUERY_REJECTED' }),
    );
  });

  it('query: CONFLICT is flagged for human approval and blocks delivery', async () => {
    const { service, sech, router, audit } = makeService();
    sech.route.mockResolvedValue(
      approvedRoute({
        status: 'CONFLICT',
        requiresHumanApproval: true,
        counterProposal: 'Escalate.',
      }),
    );

    const result = await service.query('ws-1', 'user-1', { query: 'ambiguous' });

    expect(router.route).not.toHaveBeenCalled();
    expect(result.status).toBe('flagged');
    expect((result as any).requiresHumanApproval).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AI_QUERY_FLAGGED' }));
  });

  it('query: pins the preferred provider', async () => {
    const { service, sech, router } = makeService();
    sech.route.mockResolvedValue(approvedRoute());
    await service.query('ws-1', 'user-1', { query: 'q', providerId: 'llama' });
    expect(router.route).toHaveBeenCalledWith('q', expect.any(Object), 'llama');
  });

  it('consensus: approved runs multi-model consensus and logs it', async () => {
    const { service, sech, router, prisma } = makeService();
    sech.route.mockResolvedValue(approvedRoute());

    const result = await service.consensus('ws-1', 'user-1', { query: 'defensible?' });

    expect(router.consensus).toHaveBeenCalled();
    expect(result.status).toBe('approved');
    expect((result as any).consensus.agreed).toBe(true);
    expect(prisma.aIQueryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerUsed: 'consensus' }) }),
    );
  });

  it('consensus: rejected returns a null consensus', async () => {
    const { service, sech, router } = makeService();
    sech.route.mockResolvedValue(approvedRoute({ status: 'REJECTED', counterProposal: 'no' }));
    const result = await service.consensus('ws-1', 'user-1', { query: 'q' });
    expect(router.consensus).not.toHaveBeenCalled();
    expect(result.consensus).toBeNull();
    expect(result.status).toBe('rejected');
  });

  it('chat: approved routes the message list through the model', async () => {
    const { service, sech, router } = makeService();
    sech.route.mockResolvedValue(approvedRoute());
    const result = await service.chat('ws-1', 'user-1', {
      messages: [{ role: 'user', content: 'differentials for vomiting?' }],
    });
    expect(router.chat).toHaveBeenCalled();
    expect(result.status).toBe('approved');
  });

  it('chat: gates on the last user message', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(approvedRoute());
    await service.chat('ws-1', 'user-1', {
      messages: [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'the real question' },
      ],
    });
    expect(sech.route).toHaveBeenCalledWith(
      'ws-1',
      'user-1',
      expect.objectContaining({ decisionContext: 'the real question' }),
      undefined,
    );
  });

  it('clinicalDiagnosis: builds an HC-02 differential prompt with the clinical system prompt', async () => {
    const { service, sech, router } = makeService();
    sech.route.mockResolvedValue(approvedRoute());
    await service.clinicalDiagnosis('ws-1', 'user-1', {
      symptoms: ['lethargy'],
      history: '8yo cat',
    });
    const [prompt, context] = router.route.mock.calls[0];
    expect(prompt).toContain('DIFFERENTIAL');
    expect(prompt).toContain('lethargy');
    expect(context.system).toBe(CLINICAL_SYSTEM_PROMPT);
    expect(context.domain).toBe('clinical');
  });

  it('clinicalProtocol: builds an evidence-based protocol prompt', async () => {
    const { service, sech, router } = makeService();
    sech.route.mockResolvedValue(approvedRoute());
    await service.clinicalProtocol('ws-1', 'user-1', { condition: 'parvovirus' });
    const [prompt] = router.route.mock.calls[0];
    expect(prompt).toContain('parvovirus');
    expect(prompt.toLowerCase()).toContain('protocol');
  });

  it('listProviders delegates to the router', () => {
    const { service, router } = makeService();
    expect(service.listProviders()).toEqual([{ name: 'openai', mode: 'mock' }]);
    expect(router.listProviderInfo).toHaveBeenCalled();
  });

  it('providerStatus returns router status', async () => {
    const { service, router } = makeService();
    router.providerStatus.mockResolvedValue({ name: 'openai', available: true, configured: false });
    await expect(service.providerStatus('openai')).resolves.toMatchObject({ name: 'openai' });
  });

  it('providerStatus throws NotFound for an unknown provider', async () => {
    const { service, router } = makeService();
    router.providerStatus.mockResolvedValue(undefined);
    await expect(service.providerStatus('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listLogs paginates workspace query logs', async () => {
    const { service, prisma } = makeService();
    prisma.aIQueryLog.count.mockResolvedValue(2);
    prisma.aIQueryLog.findMany.mockResolvedValue([{ queryId: 'q-1' }, { queryId: 'q-2' }]);
    const result = await service.listLogs('ws-1', { page: 1, pageSize: 10, domain: 'clinical' });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(prisma.aIQueryLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'ws-1', domain: 'clinical' }),
      }),
    );
  });

  it('works without the optional IURG service', async () => {
    const prisma = {
      aIQueryLog: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ ...data })) },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const router = { route: jest.fn().mockResolvedValue(aiResponse()) } as any;
    const sech = { route: jest.fn().mockResolvedValue(approvedRoute()) } as any;
    const service = new AiCoreService(prisma, audit, router, sech);
    const result = await service.query('ws-1', 'user-1', { query: 'q' });
    expect(result.status).toBe('approved');
    expect(result.iurgNodeId).toBeNull();
  });
});
