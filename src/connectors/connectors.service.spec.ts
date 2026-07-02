import { ConnectorsService } from './connectors.service';
import { BadRequestException } from '@nestjs/common';

describe('ConnectorsService', () => {
  const makeService = () => {
    const connectorConfig = {
      upsert: jest.fn(async ({ create, update }: any) => ({ id: 'cfg-1', ...(create ?? update) })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    };
    const connectorLog = {
      create: jest.fn(async ({ data }: any) => ({ id: 'log-1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'log-1', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    };
    const prisma = { connectorConfig, connectorLog } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const perception = {
      ingest: jest.fn().mockResolvedValue({ recordId: 'usfip-1', status: 'approved' }),
    } as any;
    const service = new ConnectorsService(prisma, audit, perception);
    return { prisma, audit, perception, service, connectorConfig, connectorLog };
  };

  beforeEach(() => jest.clearAllMocks());

  it('assertConnector rejects unknown connectors', () => {
    const { service } = makeService();
    expect(() => service.assertConnector('sms')).toThrow(BadRequestException);
    expect(service.assertConnector('whatsapp')).toBe('whatsapp');
  });

  it('configure rejects an invalid provider', async () => {
    const { service } = makeService();
    await expect(
      service.configure('ws-1', 'whatsapp', { provider: 'square' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('configure upserts and redacts credentials', async () => {
    const { service, connectorConfig, audit } = makeService();
    const result = await service.configure('ws-1', 'whatsapp', {
      provider: 'twilio',
      isActive: true,
      credentials: { authToken: 'secret' },
      settings: { account: '+15551234567' },
    });
    expect(connectorConfig.upsert).toHaveBeenCalled();
    expect(result.credentials).toEqual({ configured: true });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONNECTOR_CONFIGURED' }),
    );
  });

  it('ingest routes to the USFIP bus and marks the log processed', async () => {
    const { service, perception, connectorLog, audit } = makeService();
    const result = await service.ingest({
      workspaceId: 'ws-1',
      connector: 'emr',
      provider: 'vettriage',
      eventType: 'sync',
      requesterId: 'system-emr',
      perception: { sourceId: 'p-1', payload: { a: 1 } },
    });
    expect(perception.ingest).toHaveBeenCalledWith(
      'ws-1',
      'system-emr',
      expect.objectContaining({ sourceType: 'emr', proposedTier: 1, proposedDomain: 'clinical' }),
      undefined,
    );
    expect(result.status).toBe('processed');
    expect(result.usfipRecordId).toBe('usfip-1');
    expect(connectorLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'processed', usfipRecordId: 'usfip-1' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONNECTOR_INGESTED' }),
    );
  });

  it('ingest short-circuits filtered events without touching the bus', async () => {
    const { service, perception } = makeService();
    const result = await service.ingest({
      workspaceId: 'ws-1',
      connector: 'whatsapp',
      provider: 'twilio',
      eventType: 'incoming_webhook',
      requesterId: 'system-whatsapp',
      filteredReason: 'status_update:delivered',
      perception: { payload: {} },
    });
    expect(perception.ingest).not.toHaveBeenCalled();
    expect(result.status).toBe('filtered');
  });

  it('ingest records a failure when the bus throws', async () => {
    const { service, perception, connectorLog } = makeService();
    perception.ingest.mockRejectedValue(new Error('bus down'));
    const result = await service.ingest({
      workspaceId: 'ws-1',
      connector: 'pos',
      provider: 'square',
      eventType: 'incoming_webhook',
      requesterId: 'system-pos',
      perception: { payload: {} },
    });
    expect(result.status).toBe('failed');
    expect(connectorLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });

  it('resolveWebhookWorkspace matches by account settings', async () => {
    const { service, connectorConfig } = makeService();
    connectorConfig.findMany.mockResolvedValue([
      { workspaceId: 'ws-a', settings: { account: '+1999' } },
      { workspaceId: 'ws-b', settings: { account: '+15551234567' } },
    ]);
    const ws = await service.resolveWebhookWorkspace('whatsapp', { accountRef: '+15551234567' });
    expect(ws).toBe('ws-b');
  });

  it('resolveWebhookWorkspace falls back to an explicit active workspaceId', async () => {
    const { service, connectorConfig } = makeService();
    connectorConfig.findMany.mockResolvedValue([{ workspaceId: 'ws-x', settings: {} }]);
    const ws = await service.resolveWebhookWorkspace('pos', { workspaceId: 'ws-x' });
    expect(ws).toBe('ws-x');
  });

  it('resolveWebhookWorkspace throws when nothing matches', async () => {
    const { service, connectorConfig } = makeService();
    connectorConfig.findMany.mockResolvedValue([]);
    await expect(
      service.resolveWebhookWorkspace('pos', { workspaceId: 'ws-x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stats aggregates log counts by status', async () => {
    const { service, connectorLog } = makeService();
    connectorLog.groupBy.mockResolvedValue([
      { status: 'processed', _count: { _all: 3 } },
      { status: 'filtered', _count: { _all: 1 } },
    ]);
    const stats = await service.stats('ws-1', 'whatsapp');
    expect(stats.total).toBe(4);
    expect(stats.byStatus).toEqual({ processed: 3, filtered: 1 });
    expect(stats.tier).toBe(2);
  });
});
