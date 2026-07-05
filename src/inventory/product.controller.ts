import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly inventoryService: InventoryService, private readonly auditService: AuditService) {}

  @Post() @RequirePermissions(Permission.INVENTORY_CREATE) async create(@Body() data: Prisma.ProductCreateInput, @Req() req: any) { const r = await this.inventoryService.createProduct(data); await this.auditService.log({ action: 'CREATE_PRODUCT', resource: 'Product', resourceId: r.id, actorId: req.user?.userId || 'system', workspaceId: data.workspaceId as string, newValue: r }); return r; }
  @Get() @RequirePermissions(Permission.INVENTORY_READ) async findAll(@Query('workspaceId') w: string) { return this.inventoryService.findAllProducts(w); }
  @Get('search') @RequirePermissions(Permission.INVENTORY_READ) async search(@Query('workspaceId') w: string, @Query('q') q: string) { return this.inventoryService.searchProducts(w, q); }
  @Get('category/:cat') @RequirePermissions(Permission.INVENTORY_READ) async byCategory(@Param('cat') c: string, @Query('workspaceId') w: string) { return this.inventoryService.findProductsByCategory(w, c); }
  @Get('low-stock') @RequirePermissions(Permission.INVENTORY_READ) async lowStock(@Query('workspaceId') w: string) { return this.inventoryService.findLowStock(w); }
  @Get('expiring') @RequirePermissions(Permission.INVENTORY_READ) async expiring(@Query('workspaceId') w: string, @Query('days') d: string) { const date = new Date(); date.setDate(date.getDate() + parseInt(d || '30', 10)); return this.inventoryService.findExpiring(w, date); }
  @Get(':id') @RequirePermissions(Permission.INVENTORY_READ) async findOne(@Param('id') id: string, @Query('workspaceId') w: string) { return this.inventoryService.findOneProduct(id, w); }
  @Put(':id') @RequirePermissions(Permission.INVENTORY_UPDATE) async update(@Param('id') id: string, @Query('workspaceId') w: string, @Body() d: Prisma.ProductUpdateInput, @Req() req: any) { const b = await this.inventoryService.findOneProduct(id, w); const r = await this.inventoryService.updateProduct(id, w, d); await this.auditService.log({ action: 'UPDATE_PRODUCT', resource: 'Product', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w, oldValue: b, newValue: r }); return r; }
  @Delete(':id') @RequirePermissions(Permission.INVENTORY_DELETE) async remove(@Param('id') id: string, @Query('workspaceId') w: string, @Req() req: any) { const b = await this.inventoryService.findOneProduct(id, w); const r = await this.inventoryService.removeProduct(id, w); await this.auditService.log({ action: 'DELETE_PRODUCT', resource: 'Product', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w, oldValue: b }); return r; }
}
