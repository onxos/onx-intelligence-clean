import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req,
} from '@nestjs/common';
import { ClinicalDocumentService } from './clinical-document.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('clinical-documents')
@UseGuards(JwtAuthGuard)
export class ClinicalDocumentController {
  constructor(
    private readonly clinicalDocumentService: ClinicalDocumentService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermissions(Permission.DOCUMENT_CREATE)
  async create(@Body() data: Prisma.ClinicalDocumentCreateInput, @Req() req: any) {
    const result = await this.clinicalDocumentService.create(data);
    await this.auditService.log({
      action: 'CREATE_CLINICAL_DOCUMENT',
      resource: 'ClinicalDocument',
      resourceId: result.id,
      actorId: req.user?.userId || 'system',
      workspaceId: data.workspaceId as string,
      newValue: result,
    });
    return result;
  }

  @Get()
  @RequirePermissions(Permission.DOCUMENT_READ)
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.clinicalDocumentService.findAll(workspaceId);
  }

  @Get('patient/:patientId')
  @RequirePermissions(Permission.PATIENT_READ, Permission.DOCUMENT_READ)
  async findByPatient(@Param('patientId') patientId: string, @Query('workspaceId') workspaceId: string) {
    return this.clinicalDocumentService.findByPatient(patientId, workspaceId);
  }

  @Get('medical-record/:mrId')
  @RequirePermissions(Permission.MEDICAL_RECORD_READ, Permission.DOCUMENT_READ)
  async findByMedicalRecord(@Param('mrId') mrId: string, @Query('workspaceId') workspaceId: string) {
    return this.clinicalDocumentService.findByMedicalRecord(mrId, workspaceId);
  }

  @Get('type/:type')
  @RequirePermissions(Permission.DOCUMENT_READ)
  async findByType(@Param('type') type: string, @Query('workspaceId') workspaceId: string) {
    return this.clinicalDocumentService.findByType(workspaceId, type);
  }

  @Get(':id')
  @RequirePermissions(Permission.DOCUMENT_READ)
  async findOne(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.clinicalDocumentService.findOne(id, workspaceId);
  }

  @Put(':id')
  @RequirePermissions(Permission.DOCUMENT_UPDATE)
  async update(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Body() data: Prisma.ClinicalDocumentUpdateInput, @Req() req: any) {
    const before = await this.clinicalDocumentService.findOne(id, workspaceId);
    const result = await this.clinicalDocumentService.update(id, workspaceId, data);
    await this.auditService.log({
      action: 'UPDATE_CLINICAL_DOCUMENT',
      resource: 'ClinicalDocument',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
      newValue: result,
    });
    return result;
  }

  @Delete(':id')
  @RequirePermissions(Permission.DOCUMENT_DELETE)
  async remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Req() req: any) {
    const before = await this.clinicalDocumentService.findOne(id, workspaceId);
    const result = await this.clinicalDocumentService.remove(id, workspaceId);
    await this.auditService.log({
      action: 'DELETE_CLINICAL_DOCUMENT',
      resource: 'ClinicalDocument',
      resourceId: id,
      actorId: req.user?.userId || 'system',
      workspaceId,
      oldValue: before,
    });
    return result;
  }
}
