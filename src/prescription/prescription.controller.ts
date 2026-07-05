import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req,
} from '@nestjs/common';
import { PrescriptionService } from './prescription.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionController {
  constructor(
    private readonly prescriptionService: PrescriptionService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermissions(Permission.PRESCRIPTION_CREATE)
  async create(@Body() data: Prisma.PrescriptionCreateInput, @Req() req: any) {
    const result = await this.prescriptionService.create(data);
    await this.auditService.log({
      action: 'CREATE_PRESCRIPTION',
      resource: 'Prescription',
      resourceId: result.id,
      actorId: req.user?.userId || 'system',
      workspaceId: data.workspaceId as string,
      newValue: result,
    });
    return result;
  }

  @Get()
  @RequirePermissions(Permission.PRESCRIPTION_READ)
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.prescriptionService.findAll(workspaceId);
  }

  @Get('patient/:patientId')
  @RequirePermissions(Permission.PATIENT_READ, Permission.PRESCRIPTION_READ)
  async findByPatient(@Param('patientId') patientId: string, @Query('workspaceId') workspaceId: string) {
    return this.prescriptionService.findByPatient(patientId, workspaceId);
  }

  @Get(':id')
  @RequirePermissions(Permission.PRESCRIPTION_READ)
  async findOne(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.prescriptionService.findOne(id, workspaceId);
  }

  @Put(':id')
  @RequirePermissions(Permission.PRESCRIPTION_UPDATE)
  async update(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Body() data: Prisma.PrescriptionUpdateInput, @Req() req: any) {
    const before = await this.prescriptionService.findOne(id, workspaceId);
    const result = await this.prescriptionService.update(id, workspaceId, data);
    await this.auditService.log({
      action: 'UPDATE_PRESCRIPTION',
      resource: 'Prescription',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
      newValue: result,
    });
    return result;
  }

  @Put(':id/discontinue')
  @RequirePermissions(Permission.PRESCRIPTION_UPDATE)
  async discontinue(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Req() req: any) {
    const before = await this.prescriptionService.findOne(id, workspaceId);
    const result = await this.prescriptionService.discontinue(id, workspaceId);
    await this.auditService.log({
      action: 'DISCONTINUE_PRESCRIPTION',
      resource: 'Prescription',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
      newValue: result,
    });
    return result;
  }

  @Delete(':id')
  @RequirePermissions(Permission.PRESCRIPTION_DELETE)
  async remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Req() req: any) {
    const before = await this.prescriptionService.findOne(id, workspaceId);
    const result = await this.prescriptionService.remove(id, workspaceId);
    await this.auditService.log({
      action: 'DELETE_PRESCRIPTION',
      resource: 'Prescription',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
    });
    return result;
  }
}
