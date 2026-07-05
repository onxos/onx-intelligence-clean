import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req, Patch } from '@nestjs/common';
import { ConnectorService } from './connector.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('connectors')
@UseGuards(JwtAuthGuard)
export class ConnectorController {
  constructor(private readonly connectorService: ConnectorService, private readonly auditService: AuditService) {}

  @Post() @RequirePermissions(Permission.CONNECTOR_MANAGE) async create(@Body() data: Prisma.ConnectorConfigCreateInput, @Req() req: any) { const r = await this.connectorService.create(data); await this.auditService.log({ action: 'CREATE_CONNECTOR', resource: 'ConnectorConfig', resourceId: r.id, actorId: req.user?.userId || 'system', workspaceId: data.workspaceId as string, newValue: r }); return r; }
  @Get() @RequirePermissions(Permission.CONNECTOR_READ) async findAll(@Query('workspaceId') w: string) { return this.connectorService.findAll(w); }
  @Get('type/:type') @RequirePermissions(Permission.CONNECTOR_READ) async byType(@Param('type') t: string, @Query('workspaceId') w: string) { return this.connectorService.findByType(w, t); }
  @Get(':id') @RequirePermissions(Permission.CONNECTOR_READ) async findOne(@Param('id') id: string, @Query('workspaceId') w: string) { return this.connectorService.findOne(id, w); }
  @Put(':id') @RequirePermissions(Permission.CONNECTOR_MANAGE) async update(@Param('id') id: string, @Query('workspaceId') w: string, @Body() d: Prisma.ConnectorConfigUpdateInput, @Req() req: any) { const b = await this.connectorService.findOne(id, w); const r = await this.connectorService.update(id, w, d); await this.auditService.log({ action: 'UPDATE_CONNECTOR', resource: 'ConnectorConfig', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w, oldValue: b, newValue: r }); return r; }
  @Patch(':id/activate') @RequirePermissions(Permission.CONNECTOR_MANAGE) async activate(@Param('id') id: string, @Query('workspaceId') w: string, @Req() req: any) { const r = await this.connectorService.activate(id, w); await this.auditService.log({ action: 'ACTIVATE_CONNECTOR', resource: 'ConnectorConfig', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w, newValue: r }); return r; }
  @Patch(':id/deactivate') @RequirePermissions(Permission.CONNECTOR_MANAGE) async deactivate(@Param('id') id: string, @Query('workspaceId') w: string, @Req() req: any) { const r = await this.connectorService.deactivate(id, w); await this.auditService.log({ action: 'DEACTIVATE_CONNECTOR', resource: 'ConnectorConfig', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w, newValue: r }); return r; }
  @Delete(':id') @RequirePermissions(Permission.CONNECTOR_MANAGE) async remove(@Param('id') id: string, @Query('workspaceId') w: string, @Req() req: any) { const b = await this.connectorService.findOne(id, w); const r = await this.connectorService.remove(id, w); await this.auditService.log({ action: 'DELETE_CONNECTOR', resource: 'ConnectorConfig', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w, oldValue: b }); return r; }
  @Get(':id/logs') @RequirePermissions(Permission.CONNECTOR_READ) async logs(@Param('id') id: string, @Query('workspaceId') w: string, @Query('limit') l: string) { return this.connectorService.getLogs(w, id, l ? parseInt(l, 10) : 50); }
}
