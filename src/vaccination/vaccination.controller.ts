import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req,
} from '@nestjs/common';
import { VaccinationService } from './vaccination.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('vaccinations')
@UseGuards(JwtAuthGuard)
export class VaccinationController {
  constructor(
    private readonly vaccinationService: VaccinationService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermissions(Permission.VACCINATION_CREATE)
  async create(@Body() data: Prisma.VaccinationRecordCreateInput, @Req() req: any) {
    const result = await this.vaccinationService.create(data);
    await this.auditService.log({
      action: 'CREATE_VACCINATION',
      resource: 'VaccinationRecord',
      resourceId: result.id,
      actorId: req.user?.userId || 'system',
      workspaceId: data.workspaceId as string,
      newValue: result,
    });
    return result;
  }

  @Get()
  @RequirePermissions(Permission.VACCINATION_READ)
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.vaccinationService.findAll(workspaceId);
  }

  @Get('patient/:patientId')
  @RequirePermissions(Permission.PATIENT_READ, Permission.VACCINATION_READ)
  async findByPatient(@Param('patientId') patientId: string, @Query('workspaceId') workspaceId: string) {
    return this.vaccinationService.findByPatient(patientId, workspaceId);
  }

  @Get('overdue')
  @RequirePermissions(Permission.VACCINATION_READ)
  async findOverdue(@Query('workspaceId') workspaceId: string) {
    return this.vaccinationService.findOverdue(workspaceId, new Date());
  }

  @Get('upcoming')
  @RequirePermissions(Permission.VACCINATION_READ)
  async findUpcoming(
    @Query('workspaceId') workspaceId: string,
    @Query('days') days: string,
  ) {
    const windowStart = new Date();
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + parseInt(days || '30', 10));
    return this.vaccinationService.findUpcoming(workspaceId, windowStart, windowEnd);
  }

  @Get(':id')
  @RequirePermissions(Permission.VACCINATION_READ)
  async findOne(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.vaccinationService.findOne(id, workspaceId);
  }

  @Put(':id')
  @RequirePermissions(Permission.VACCINATION_UPDATE)
  async update(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Body() data: Prisma.VaccinationRecordUpdateInput, @Req() req: any) {
    const before = await this.vaccinationService.findOne(id, workspaceId);
    const result = await this.vaccinationService.update(id, workspaceId, data);
    await this.auditService.log({
      action: 'UPDATE_VACCINATION',
      resource: 'VaccinationRecord',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
      newValue: result,
    });
    return result;
  }

  @Delete(':id')
  @RequirePermissions(Permission.VACCINATION_DELETE)
  async remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Req() req: any) {
    const before = await this.vaccinationService.findOne(id, workspaceId);
    const result = await this.vaccinationService.remove(id, workspaceId);
    await this.auditService.log({
      action: 'DELETE_VACCINATION',
      resource: 'VaccinationRecord',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
    });
    return result;
  }
}
