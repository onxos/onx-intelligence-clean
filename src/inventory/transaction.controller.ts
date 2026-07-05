import { Body, Controller, Get, Param, Post, Query, UseGuards, Req } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('inventory-transactions')
@UseGuards(JwtAuthGuard)
export class TransactionController {
  constructor(private readonly inventoryService: InventoryService, private readonly auditService: AuditService) {}

  @Post() @RequirePermissions(Permission.INVENTORY_CREATE) async create(@Body() data: Prisma.InventoryTransactionCreateInput, @Req() req: any) { const r = await this.inventoryService.createTransaction(data); await this.auditService.log({ action: 'CREATE_TRANSACTION', resource: 'InventoryTransaction', resourceId: r.id, actorId: req.user?.userId || 'system', workspaceId: data.workspaceId as string, newValue: r }); return r; }
  @Get('product/:productId') @RequirePermissions(Permission.INVENTORY_READ) async byProduct(@Param('productId') p: string, @Query('workspaceId') w: string) { return this.inventoryService.findTransactionsByProduct(p, w); }
}
