import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { Permission } from '../../rbac/permissions.enum';
import { RbacGuard, RequirePermissions } from '../../rbac/rbac.guard';
import { BillingEngineService } from './billing-engine.service';
import { CreateInvoiceDto, ListInvoiceQueryDto, UpdateInvoiceDto } from './billing-engine.dto';

@ApiTags('Financial')
@Controller('financial/invoices')
@UseGuards(JwtAuthGuard, RbacGuard)
export class BillingEngineController {
  constructor(private readonly service: BillingEngineService) {}

  @Post()
  @RequirePermissions(Permission.BILLING_CREATE)
  create(@Req() req: { user: { workspaceId: string; userId: string } }, @Body() dto: CreateInvoiceDto) {
    return this.service.create(req.user.workspaceId, req.user.userId, dto);
  }

  @Get()
  @RequirePermissions(Permission.BILLING_READ)
  list(@Req() req: { user: { workspaceId: string } }, @Query() query: ListInvoiceQueryDto) {
    return this.service.list(req.user.workspaceId, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.BILLING_READ)
  getById(@Req() req: { user: { workspaceId: string } }, @Param('id') id: string) {
    return this.service.getById(req.user.workspaceId, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.BILLING_UPDATE)
  update(
    @Req() req: { user: { workspaceId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.service.update(req.user.workspaceId, id, dto);
  }

  @Post(':id/void')
  @RequirePermissions(Permission.BILLING_DELETE)
  voidInvoice(@Req() req: { user: { workspaceId: string } }, @Param('id') id: string) {
    return this.service.void(req.user.workspaceId, id);
  }

  @Post(':id/send')
  @RequirePermissions(Permission.BILLING_CREATE)
  send(@Req() req: { user: { workspaceId: string } }, @Param('id') id: string) {
    return this.service.send(req.user.workspaceId, id);
  }
}
