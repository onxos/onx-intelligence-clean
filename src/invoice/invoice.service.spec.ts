import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceService } from './invoice.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('InvoiceService', () => {
  let service: InvoiceService;
  let prisma: any;

  const mockInvoice = {
    id: 'inv_1', invoiceNumber: 'INV-2026-001', patientId: 'pat_1', title: 'Annual Checkup',
    subtotal: 100, taxRate: 0.15, taxAmount: 15, discount: 0, total: 115,
    status: 'SENT', dueDate: new Date('2026-08-01'), paidAmount: 0, balance: 115,
    workspaceId: 'ws_1', createdAt: new Date(), updatedAt: new Date(),
    items: [], payments: [],
  };

  beforeEach(async () => {
    prisma = {
      invoice: { create: jest.fn().mockResolvedValue(mockInvoice), findMany: jest.fn().mockResolvedValue([mockInvoice]), findFirst: jest.fn().mockResolvedValue(mockInvoice), update: jest.fn().mockResolvedValue(mockInvoice), delete: jest.fn().mockResolvedValue(mockInvoice) },
    };
    const module: TestingModule = await Test.createTestingModule({ providers: [InvoiceService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get<InvoiceService>(InvoiceService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });
  it('should create', async () => { const r = await service.create({ title: 'Checkup', total: 100, balance: 100, invoiceNumber: 'INV-001', patientId: 'pat_1', workspaceId: 'ws_1' } as any); expect(r).toEqual(mockInvoice); });
  it('should findAll', async () => { const r = await service.findAll('ws_1'); expect(r).toEqual([mockInvoice]); });
  it('should findOne', async () => { const r = await service.findOne('inv_1', 'ws_1'); expect(r).toEqual(mockInvoice); });
  it('should throw NotFoundException', async () => { prisma.invoice.findFirst = jest.fn().mockResolvedValue(null); await expect(service.findOne('inv_x', 'ws_1')).rejects.toThrow(NotFoundException); });
  it('should findByPatient', async () => { const r = await service.findByPatient('pat_1', 'ws_1'); expect(r).toEqual([mockInvoice]); });
  it('should findByStatus', async () => { const r = await service.findByStatus('ws_1', 'SENT'); expect(r).toEqual([mockInvoice]); });
  it('should findOverdue', async () => { const r = await service.findOverdue('ws_1', new Date()); expect(r).toEqual([mockInvoice]); });
  it('should update', async () => { const r = await service.update('inv_1', 'ws_1', { title: 'Updated' }); expect(r).toEqual(mockInvoice); });
  it('should updateStatus', async () => { const r = await service.updateStatus('inv_1', 'ws_1', 'PAID'); expect(r).toEqual(mockInvoice); });
  it('should remove', async () => { const r = await service.remove('inv_1', 'ws_1'); expect(r).toEqual(mockInvoice); });
});
