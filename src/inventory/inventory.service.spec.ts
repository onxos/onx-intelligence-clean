import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: any;

  const mockProduct = { id: 'prod_1', sku: 'MED-001', name: 'Amoxicillin 250mg', category: 'MEDICATION', quantityOnHand: 50, reorderLevel: 20, unitCost: 5.5, sellingPrice: 12.0, workspaceId: 'ws_1', createdAt: new Date(), updatedAt: new Date() };

  beforeEach(async () => {
    prisma = {
      product: { create: jest.fn().mockResolvedValue(mockProduct), findMany: jest.fn().mockResolvedValue([mockProduct]), findFirst: jest.fn().mockResolvedValue(mockProduct), update: jest.fn().mockResolvedValue(mockProduct), delete: jest.fn().mockResolvedValue(mockProduct) },
      inventoryTransaction: { create: jest.fn().mockResolvedValue({ id: 'txn_1', productId: 'prod_1', type: 'INCOMING', quantity: 20, workspaceId: 'ws_1' }) },
      inventoryAlert: { create: jest.fn().mockResolvedValue({ id: 'al_1', productId: 'prod_1', alertType: 'LOW_STOCK', severity: 'HIGH', message: 'Low stock', workspaceId: 'ws_1' }), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({ id: 'al_1', resolved: true }) },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({ providers: [InventoryService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => expect(service).toBeDefined());
  it('should create product', async () => { const r = await service.createProduct({ name: 'Amox', sku: 'MED-001', unitCost: 5.5, sellingPrice: 12, workspaceId: 'ws_1' } as any); expect(r).toEqual(mockProduct); });
  it('should findAll products', async () => { const r = await service.findAllProducts('ws_1'); expect(r).toEqual([mockProduct]); });
  it('should findOne', async () => { const r = await service.findOneProduct('prod_1', 'ws_1'); expect(r).toEqual(mockProduct); });
  it('should throw NotFoundException', async () => { prisma.product.findFirst = jest.fn().mockResolvedValue(null); await expect(service.findOneProduct('x', 'ws_1')).rejects.toThrow(NotFoundException); });
  it('should search', async () => { const r = await service.searchProducts('ws_1', 'Amox'); expect(r).toEqual([mockProduct]); });
  it('should findByCategory', async () => { const r = await service.findProductsByCategory('ws_1', 'MEDICATION'); expect(r).toEqual([mockProduct]); });
  it('should update product', async () => { const r = await service.updateProduct('prod_1', 'ws_1', { name: 'Updated' }); expect(r).toEqual(mockProduct); });
  it('should remove product', async () => { const r = await service.removeProduct('prod_1', 'ws_1'); expect(r).toEqual(mockProduct); });
});
