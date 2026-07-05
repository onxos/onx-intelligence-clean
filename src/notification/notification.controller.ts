import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService, private readonly auditService: AuditService) {}

  @Post() @RequirePermissions(Permission.NOTIFICATION_CREATE) async create(@Body() data: Prisma.NotificationCreateInput, @Req() req: any) { const r = await this.notificationService.create(data); await this.auditService.log({ action: 'CREATE_NOTIFICATION', resource: 'Notification', resourceId: r.id, actorId: req.user?.userId || 'system', workspaceId: data.workspaceId as string, newValue: r }); return r; }
  @Get() @RequirePermissions(Permission.NOTIFICATION_READ) async findAll(@Query('workspaceId') w: string) { return this.notificationService.findAll(w); }
  @Get('user/:userId') @RequirePermissions(Permission.NOTIFICATION_READ) async byUser(@Param('userId') u: string, @Query('workspaceId') w: string) { return this.notificationService.findByUser(u, w); }
  @Get('unread/:userId') @RequirePermissions(Permission.NOTIFICATION_READ) async unread(@Param('userId') u: string, @Query('workspaceId') w: string) { return this.notificationService.findUnread(u, w); }
  @Get('unread/:userId/count') @RequirePermissions(Permission.NOTIFICATION_READ) async unreadCount(@Param('userId') u: string, @Query('workspaceId') w: string) { return this.notificationService.findUnreadCount(u, w); }
  @Get('type/:type') @RequirePermissions(Permission.NOTIFICATION_READ) async byType(@Param('type') t: string, @Query('workspaceId') w: string) { return this.notificationService.findByType(w, t); }
  @Put(':id/read') @RequirePermissions(Permission.NOTIFICATION_UPDATE) async markRead(@Param('id') id: string, @Query('workspaceId') w: string, @Req() req: any) { const r = await this.notificationService.markAsRead(id, w); await this.auditService.log({ action: 'MARK_READ', resource: 'Notification', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w, newValue: r }); return r; }
  @Put('read-all/:userId') @RequirePermissions(Permission.NOTIFICATION_UPDATE) async markAllRead(@Param('userId') u: string, @Query('workspaceId') w: string, @Req() req: any) { const r = await this.notificationService.markAllAsRead(u, w); await this.auditService.log({ action: 'MARK_ALL_READ', resource: 'Notification', actorId: req.user?.userId || 'system', workspaceId: w, newValue: r }); return r; }
  @Delete(':id') @RequirePermissions(Permission.NOTIFICATION_DELETE) async remove(@Param('id') id: string, @Query('workspaceId') w: string, @Req() req: any) { const r = await this.notificationService.remove(id, w); await this.auditService.log({ action: 'DELETE_NOTIFICATION', resource: 'Notification', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w }); return r; }
}
