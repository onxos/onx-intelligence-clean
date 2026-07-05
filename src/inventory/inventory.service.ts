import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Product, InventoryTransaction, InventoryAlert, Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Product ---
  async createProduct(data: Prisma.ProductCreateInput): Promise<Product> {
    return this.prisma.product.create({ data });
  }

  async findAllProducts(workspaceId: string): Promise<Product[]> {
    return this.prisma.product.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } });
  }

  async findOneProduct(id: string, workspaceId: string): Promise<Product> {
    const p = await this.prisma.product.findFirst({ where: { id, workspaceId }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  async findProductsByCategory(workspaceId: string, category: string): Promise<Product[]> {
    return this.prisma.product.findMany({ where: { workspaceId, category: category as any }, orderBy: { name: 'asc' } });
  }

  async searchProducts(workspaceId: string, query: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { workspaceId, OR: [{ name: { contains: query, mode: 'insensitive' } }, { sku: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] },
      orderBy: { name: 'asc' },
    });
  }

  async findLowStock(workspaceId: string): Promise<Product[]> {
    const products = await this.prisma.product.findMany({
      where: { workspaceId, isActive: true },
      orderBy: { quantityOnHand: 'asc' },
    });
    return products.filter((p) => p.quantityOnHand <= p.reorderLevel);
  }

  async findExpiring(workspaceId: string, before: Date): Promise<Product[]> {
    return this.prisma.product.findMany({ where: { workspaceId, expiryDate: { lte: before, not: null } }, orderBy: { expiryDate: 'asc' } });
  }

  async updateProduct(id: string, workspaceId: string, data: Prisma.ProductUpdateInput): Promise<Product> {
    await this.findOneProduct(id, workspaceId);
    return this.prisma.product.update({ where: { id }, data });
  }

  async removeProduct(id: string, workspaceId: string): Promise<Product> {
    await this.findOneProduct(id, workspaceId);
    return this.prisma.product.delete({ where: { id } });
  }

  // --- Transaction ---
  async createTransaction(data: Prisma.InventoryTransactionCreateInput): Promise<InventoryTransaction> {
    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.inventoryTransaction.create({ data, include: { product: true } });
      const delta = data.type === 'INCOMING' || data.type === 'RETURN' ? data.quantity as number : -(data.quantity as number);
      await tx.product.update({ where: { id: data.product.connect.id }, data: { quantityOnHand: { increment: delta } } });
      return txn;
    });
  }

  async findTransactionsByProduct(productId: string, workspaceId: string): Promise<InventoryTransaction[]> {
    return this.prisma.inventoryTransaction.findMany({ where: { productId, workspaceId }, orderBy: { createdAt: 'desc' } });
  }

  // --- Alert ---
  async createAlert(data: Prisma.InventoryAlertCreateInput): Promise<InventoryAlert> {
    return this.prisma.inventoryAlert.create({ data });
  }

  async findAllAlerts(workspaceId: string): Promise<InventoryAlert[]> {
    return this.prisma.inventoryAlert.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  }

  async findUnresolvedAlerts(workspaceId: string): Promise<InventoryAlert[]> {
    return this.prisma.inventoryAlert.findMany({ where: { workspaceId, resolved: false }, orderBy: { severity: 'asc', createdAt: 'desc' } });
  }

  async resolveAlert(id: string, workspaceId: string, resolvedBy: string): Promise<InventoryAlert> {
    return this.prisma.inventoryAlert.update({
      where: { id },
      data: { resolved: true, resolvedBy, resolvedAt: new Date() },
    });
  }
}
