import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req,
} from '@nestjs/common';
import { LabResultService } from './lab-result.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('lab-results')
@UseGuards(JwtAuthGuard)
export class LabResultController {
  constructor(
    private readonly labResultService: LabResultService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermissions(Permission.LAB_RESULT_CREATE)
  async create(@Body() data: Prisma.LabResultCreateInput, @Req() req: any) {
    const result = await this.labResultService.create(data);
    await this.auditService.log({
      action: 'CREATE_LAB_RESULT',
      resource: 'LabResult',
      resourceId: result.id,
      actorId: req.user?.userId || 'system',
      workspaceId: data.workspaceId as string,
      newValue: result,
    });
    return result;
  }

  @Get()
  @RequirePermissions(Permission.LAB_RESULT_READ)
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.labResultService.findAll(workspaceId);
  }

  @Get('patient/:patientId')
  @RequirePermissions(Permission.PATIENT_READ, Permission.LAB_RESULT_READ)
  async findByPatient(@Param('patientId') patientId: string, @Query('workspaceId') workspaceId: string) {
    return this.labResultService.findByPatient(patientId, workspaceId);
  }

  @Get('category/:category')
  @RequirePermissions(Permission.LAB_RESULT_READ)
  async findByCategory(@Param('category') category: string, @Query('workspaceId') workspaceId: string) {
    return this.labResultService.findByCategory(workspaceId, category);
  }

  @Get('status/:status')
  @RequirePermissions(Permission.LAB_RESULT_READ)
  async findByStatus(@Param('status') status: string, @Query('workspaceId') workspaceId: string) {
    return this.labResultService.findByStatus(workspaceId, status);
  }

  @Get(':id')
  @RequirePermissions(Permission.LAB_RESULT_READ)
  async findOne(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.labResultService.findOne(id, workspaceId);
  }

  @Put(':id')
  @RequirePermissions(Permission.LAB_RESULT_UPDATE)
  async update(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Body() data: Prisma.LabResultUpdateInput, @Req() req: any) {
    const before = await this.labResultService.findOne(id, workspaceId);
    const result = await this.labResultService.update(id, workspaceId, data);
    await this.auditService.log({
      action: 'UPDATE_LAB_RESULT',
      resource: 'LabResult',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
      newValue: result,
    });
    return result;
  }

  @Delete(':id')
  @RequirePermissions(Permission.LAB_RESULT_DELETE)
  async remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Req() req: any) {
    const before = await this.labResultService.findOne(id, workspaceId);
    const result = await this.labResultService.remove(id, workspaceId);
    await this.auditService.log({
      action: 'DELETE_LAB_RESULT',
      resource: 'LabResult',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
    });
    return result;
  }
}
