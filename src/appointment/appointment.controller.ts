import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermissions(Permission.APPOINTMENT_CREATE)
  async create(@Body() data: Prisma.AppointmentCreateInput, @Req() req: any) {
    const result = await this.appointmentService.create(data);
    await this.auditService.log({
      action: 'CREATE_APPOINTMENT',
      resource: 'Appointment',
      resourceId: result.id,
      actorId: req.user?.userId || 'system',
      workspaceId: data.workspaceId as string,
      newValue: result,
    });
    return result;
  }

  @Get()
  @RequirePermissions(Permission.APPOINTMENT_READ)
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.appointmentService.findAll(workspaceId);
  }

  @Get('status/:status')
  @RequirePermissions(Permission.APPOINTMENT_READ)
  async findByStatus(@Query('workspaceId') workspaceId: string, @Param('status') status: string) {
    return this.appointmentService.findByStatus(workspaceId, status);
  }

  @Get('range')
  @RequirePermissions(Permission.APPOINTMENT_READ)
  async findByDateRange(
    @Query('workspaceId') workspaceId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.appointmentService.findByDateRange(workspaceId, new Date(start), new Date(end));
  }

  @Get(':id')
  @RequirePermissions(Permission.APPOINTMENT_READ)
  async findOne(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.appointmentService.findOne(id, workspaceId);
  }

  @Put(':id')
  @RequirePermissions(Permission.APPOINTMENT_UPDATE)
  async update(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Body() data: Prisma.AppointmentUpdateInput, @Req() req: any) {
    const before = await this.appointmentService.findOne(id, workspaceId);
    const result = await this.appointmentService.update(id, workspaceId, data);
    await this.auditService.log({
      action: 'UPDATE_APPOINTMENT',
      resource: 'Appointment',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
      newValue: result,
    });
    return result;
  }

  @Delete(':id')
  @RequirePermissions(Permission.APPOINTMENT_DELETE)
  async remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Req() req: any) {
    const before = await this.appointmentService.findOne(id, workspaceId);
    const result = await this.appointmentService.remove(id, workspaceId);
    await this.auditService.log({
      action: 'DELETE_APPOINTMENT',
      resource: 'Appointment',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
    });
    return result;
  }
}
