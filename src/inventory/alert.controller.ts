import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, Req } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('inventory-alerts')
@UseGuards(JwtAuthGuard)
export class AlertController {
  constructor(private readonly inventoryService: InventoryService, private readonly auditService: AuditService) {}

  @Post() @RequirePermissions(Permission.INVENTORY_CREATE) async create(@Body() data: Prisma.InventoryAlertCreateInput, @Req() req: any) { const r = await this.inventoryService.createAlert(data); await this.auditService.log({ action: 'CREATE_INVENTORY_ALERT', resource: 'InventoryAlert', resourceId: r.id, actorId: req.user?.userId || 'system', workspaceId: data.workspaceId as string, newValue: r }); return r; }
  @Get() @RequirePermissions(Permission.INVENTORY_READ) async findAll(@Query('workspaceId') w: string) { return this.inventoryService.findAllAlerts(w); }
  @Get('unresolved') @RequirePermissions(Permission.INVENTORY_READ) async unresolved(@Query('workspaceId') w: string) { return this.inventoryService.findUnresolvedAlerts(w); }
  @Put(':id/resolve') @RequirePermissions(Permission.INVENTORY_UPDATE) async resolve(@Param('id') id: string, @Query('workspaceId') w: string, @Body('resolvedBy') rb: string, @Req() req: any) { const r = await this.inventoryService.resolveAlert(id, w, rb || req.user?.userId); await this.auditService.log({ action: 'RESOLVE_ALERT', resource: 'InventoryAlert', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w, newValue: r }); return r; }
}
