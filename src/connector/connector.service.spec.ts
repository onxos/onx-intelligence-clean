import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorService } from './connector.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('ConnectorService', () => {
  let service: ConnectorService;
  let prisma: any;
  const mock = { id: 'conn_1', name: 'Twilio SMS', type: 'MESSAGING', provider: 'TWILIO', isActive: true, credentials: {}, workspaceId: 'ws_1', createdAt: new Date(), updatedAt: new Date() };

  beforeEach(async () => {
    prisma = {
      connectorConfig: { create: jest.fn().mockResolvedValue(mock), findMany: jest.fn().mockResolvedValue([mock]), findFirst: jest.fn().mockResolvedValue(mock), update: jest.fn().mockResolvedValue(mock), delete: jest.fn().mockResolvedValue(mock), count: jest.fn().mockResolvedValue(1) },
      connectorLog: { create: jest.fn().mockResolvedValue({ id: 'log_1' }), findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({ providers: [ConnectorService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get<ConnectorService>(ConnectorService);
  });

  it('should be defined', () => expect(service).toBeDefined());
  it('should create', async () => { const r = await service.create({ name: 'Twilio', type: 'MESSAGING', provider: 'TWILIO', credentials: {}, workspaceId: 'ws_1' } as any); expect(r).toEqual(mock); });
  it('should findAll', async () => { const r = await service.findAll('ws_1'); expect(r).toEqual([mock]); });
  it('should findOne', async () => { const r = await service.findOne('conn_1', 'ws_1'); expect(r).toEqual(mock); });
  it('should throw NotFoundException', async () => { prisma.connectorConfig.findFirst = jest.fn().mockResolvedValue(null); await expect(service.findOne('x', 'ws_1')).rejects.toThrow(NotFoundException); });
  it('should findByType', async () => { const r = await service.findByType('ws_1', 'MESSAGING'); expect(r).toEqual([mock]); });
  it('should update', async () => { const r = await service.update('conn_1', 'ws_1', { name: 'Updated' }); expect(r).toEqual(mock); });
  it('should activate', async () => { const r = await service.activate('conn_1', 'ws_1'); expect(r).toEqual(mock); });
  it('should deactivate', async () => { const r = await service.deactivate('conn_1', 'ws_1'); expect(r).toEqual(mock); });
  it('should remove', async () => { const r = await service.remove('conn_1', 'ws_1'); expect(r).toEqual(mock); });
  it('should logEvent', async () => { const r = await service.logEvent('ws_1', 'conn_1', 'OUTBOUND', 'send', 'SUCCESS', {}, null, 150); expect(r).toHaveProperty('id'); });
  it('should getLogs', async () => { const r = await service.getLogs('ws_1', 'conn_1', 10); expect(Array.isArray(r)).toBe(true); });
});
