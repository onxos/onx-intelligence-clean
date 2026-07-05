import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req, Patch,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermissions(Permission.BILLING_CREATE)
  async create(@Body() data: Prisma.InvoiceCreateInput, @Req() req: any) {
    const result = await this.invoiceService.create(data);
    await this.auditService.log({ action: 'CREATE_INVOICE', resource: 'Invoice', resourceId: result.id, actorId: req.user?.userId || 'system', workspaceId: data.workspaceId as string, newValue: result });
    return result;
  }

  @Get()
  @RequirePermissions(Permission.BILLING_READ)
  async findAll(@Query('workspaceId') workspaceId: string) { return this.invoiceService.findAll(workspaceId); }

  @Get('patient/:patientId')
  @RequirePermissions(Permission.PATIENT_READ, Permission.BILLING_READ)
  async findByPatient(@Param('patientId') patientId: string, @Query('workspaceId') workspaceId: string) { return this.invoiceService.findByPatient(patientId, workspaceId); }

  @Get('status/:status')
  @RequirePermissions(Permission.BILLING_READ)
  async findByStatus(@Param('status') status: string, @Query('workspaceId') workspaceId: string) { return this.invoiceService.findByStatus(workspaceId, status); }

  @Get('overdue')
  @RequirePermissions(Permission.BILLING_READ)
  async findOverdue(@Query('workspaceId') workspaceId: string) { return this.invoiceService.findOverdue(workspaceId, new Date()); }

  @Get(':id')
  @RequirePermissions(Permission.BILLING_READ)
  async findOne(@Param('id') id: string, @Query('workspaceId') workspaceId: string) { return this.invoiceService.findOne(id, workspaceId); }

  @Put(':id')
  @RequirePermissions(Permission.BILLING_UPDATE)
  async update(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Body() data: Prisma.InvoiceUpdateInput, @Req() req: any) {
    const before = await this.invoiceService.findOne(id, workspaceId);
    const result = await this.invoiceService.update(id, workspaceId, data);
    await this.auditService.log({ action: 'UPDATE_INVOICE', resource: 'Invoice', resourceId: id, actorId: req.user?.userId || 'system', workspaceId, oldValue: before, newValue: result });
    return result;
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.BILLING_UPDATE)
  async updateStatus(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Body('status') status: string, @Req() req: any) {
    const before = await this.invoiceService.findOne(id, workspaceId);
    const result = await this.invoiceService.updateStatus(id, workspaceId, status);
    await this.auditService.log({ action: 'UPDATE_INVOICE_STATUS', resource: 'Invoice', resourceId: id, actorId: req.user?.userId || 'system', workspaceId, oldValue: before, newValue: result });
    return result;
  }

  @Delete(':id')
  @RequirePermissions(Permission.BILLING_DELETE)
  async remove(@Param('id') id: string, @Query('workspaceId') workspaceId: string, @Req() req: any) {
    const before = await this.invoiceService.findOne(id, workspaceId);
    const result = await this.invoiceService.remove(id, workspaceId);
    await this.auditService.log({ action: 'DELETE_INVOICE', resource: 'Invoice', resourceId: id, actorId: req.user?.userId || 'system', workspaceId, oldValue: before });
    return result;
  }
}
