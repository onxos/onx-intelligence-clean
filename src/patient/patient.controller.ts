import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req,
} from '@nestjs/common';
import { PatientService } from './patient.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientController {
  constructor(
    private readonly patientService: PatientService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermissions(Permission.PATIENT_CREATE)
  async create(@Body() data: Prisma.PatientCreateInput, @Req() req: any) {
    const result = await this.patientService.create(data);
    await this.auditService.log({
      action: 'CREATE_PATIENT',
      resource: 'Patient',
      resourceId: result.id,
      actorId: req.user?.userId || 'system',
      workspaceId: data.workspaceId as string,
      newValue: result,
    });
    return result;
  }

  @Get()
  @RequirePermissions(Permission.PATIENT_READ)
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.patientService.findAll(workspaceId);
  }

  @Get('search')
  @RequirePermissions(Permission.PATIENT_READ)
  async search(@Query('workspaceId') workspaceId: string, @Query('q') query: string) {
    return this.patientService.search(workspaceId, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.PATIENT_READ)
  async findOne(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.patientService.findOne(id, workspaceId);
  }

  @Put(':id')
  @RequirePermissions(Permission.PATIENT_UPDATE)
  async update(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Body() data: Prisma.PatientUpdateInput, @Req() req: any) {
    const before = await this.patientService.findOne(id, workspaceId);
    const result = await this.patientService.update(id, workspaceId, data);
    await this.auditService.log({
      action: 'UPDATE_PATIENT',
      resource: 'Patient',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
      newValue: result,
    });
    return result;
  }

  @Delete(':id')
  @RequirePermissions(Permission.PATIENT_DELETE)
  async remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Req() req: any) {
    const before = await this.patientService.findOne(id, workspaceId);
    const result = await this.patientService.remove(id, workspaceId);
    await this.auditService.log({
      action: 'DELETE_PATIENT',
      resource: 'Patient',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
    });
    return result;
  }
}
