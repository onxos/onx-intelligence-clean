import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req,
} from '@nestjs/common';
import { MedicalRecordService } from './medical-record.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('medical-records')
@UseGuards(JwtAuthGuard)
export class MedicalRecordController {
  constructor(
    private readonly medicalRecordService: MedicalRecordService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermissions(Permission.MEDICAL_RECORD_CREATE)
  async create(@Body() data: Prisma.MedicalRecordCreateInput, @Req() req: any) {
    const result = await this.medicalRecordService.create(data);
    await this.auditService.log({
      action: 'CREATE_MEDICAL_RECORD',
      resource: 'MedicalRecord',
      resourceId: result.id,
      actorId: req.user?.userId || 'system',
      workspaceId: data.workspaceId as string,
      newValue: result,
    });
    return result;
  }

  @Get()
  @RequirePermissions(Permission.MEDICAL_RECORD_READ)
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.medicalRecordService.findAll(workspaceId);
  }

  @Get('patient/:patientId')
  @RequirePermissions(Permission.PATIENT_READ, Permission.MEDICAL_RECORD_READ)
  async findByPatient(@Param('patientId') patientId: string, @Query('workspaceId') workspaceId: string) {
    return this.medicalRecordService.findByPatient(patientId, workspaceId);
  }

  @Get('veterinarian/:vetId')
  @RequirePermissions(Permission.MEDICAL_RECORD_READ)
  async findByVeterinarian(@Param('vetId') vetId: string, @Query('workspaceId') workspaceId: string) {
    return this.medicalRecordService.findByVeterinarian(vetId, workspaceId);
  }

  @Get('range')
  @RequirePermissions(Permission.MEDICAL_RECORD_READ)
  async findByDateRange(
    @Query('workspaceId') workspaceId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.medicalRecordService.findByDateRange(workspaceId, new Date(start), new Date(end));
  }

  @Get(':id')
  @RequirePermissions(Permission.MEDICAL_RECORD_READ)
  async findOne(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.medicalRecordService.findOne(id, workspaceId);
  }

  @Put(':id')
  @RequirePermissions(Permission.MEDICAL_RECORD_UPDATE)
  async update(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Body() data: Prisma.MedicalRecordUpdateInput, @Req() req: any) {
    const before = await this.medicalRecordService.findOne(id, workspaceId);
    const result = await this.medicalRecordService.update(id, workspaceId, data);
    await this.auditService.log({
      action: 'UPDATE_MEDICAL_RECORD',
      resource: 'MedicalRecord',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
      newValue: result,
    });
    return result;
  }

  @Delete(':id')
  @RequirePermissions(Permission.MEDICAL_RECORD_DELETE)
  async remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Req() req: any) {
    const before = await this.medicalRecordService.findOne(id, workspaceId);
    const result = await this.medicalRecordService.remove(id, workspaceId);
    await this.auditService.log({
      action: 'DELETE_MEDICAL_RECORD',
      resource: 'MedicalRecord',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
    });
    return result;
  }
}
