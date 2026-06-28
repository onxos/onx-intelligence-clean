import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { CapitalService } from './capital.service';
import {
  AllocationActionDto,
  CapitalHistoryQueryDto,
  CapitalListQueryDto,
  CapitalReportQueryDto,
  CreateAllocationDto,
  CreatePolicyDto,
  PolicyListQueryDto,
  UpdateAllocationDto,
  UpdatePolicyDto,
} from './dto/capital.dto';

@ApiTags('Capital')
@Controller('capital')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CapitalController {
  constructor(private readonly svc: CapitalService) {}

  @Get('allocations')
  @ApiOperation({ summary: 'List capital allocations' })
  async listAllocations(@Req() req: any, @Query() query: CapitalListQueryDto) {
    return this.svc.listAllocations(req.user.workspaceId, req.user.userId, query);
  }

  @Post('allocations')
  @ApiOperation({ summary: 'Create capital allocation' })
  @ApiBody({ type: CreateAllocationDto })
  async createAllocation(@Req() req: any, @Body() body: CreateAllocationDto) {
    return this.svc.createAllocation(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('allocations/:id')
  @ApiOperation({ summary: 'Get capital allocation details' })
  async getAllocation(@Req() req: any, @Param('id') id: string) {
    return this.svc.getAllocation(id, req.user.workspaceId, req.user.userId);
  }

  @Put('allocations/:id')
  @ApiOperation({ summary: 'Update capital allocation' })
  @ApiBody({ type: UpdateAllocationDto })
  async updateAllocation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateAllocationDto,
  ) {
    return this.svc.updateAllocation(id, req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete('allocations/:id')
  @ApiOperation({ summary: 'Soft delete capital allocation' })
  async deleteAllocation(@Req() req: any, @Param('id') id: string) {
    return this.svc.deleteAllocation(id, req.user.workspaceId, req.user.userId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Post('allocations/:id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted capital allocation' })
  async restoreAllocation(@Req() req: any, @Param('id') id: string) {
    return this.svc.restoreAllocation(id, req.user.workspaceId, req.user.userId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Post('allocations/:id/approve')
  @ApiOperation({ summary: 'Approve capital allocation' })
  @ApiBody({ type: AllocationActionDto })
  async approveAllocation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AllocationActionDto,
  ) {
    return this.svc.approveAllocation(id, req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Post('allocations/:id/reject')
  @ApiOperation({ summary: 'Reject capital allocation' })
  @ApiBody({ type: AllocationActionDto })
  async rejectAllocation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AllocationActionDto,
  ) {
    return this.svc.rejectAllocation(id, req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('policies')
  @ApiOperation({ summary: 'List allocation policies' })
  async listPolicies(@Req() req: any, @Query() query: PolicyListQueryDto) {
    return this.svc.listPolicies(req.user.workspaceId, req.user.userId, query);
  }

  @Post('policies')
  @ApiOperation({ summary: 'Create allocation policy' })
  @ApiBody({ type: CreatePolicyDto })
  async createPolicy(@Req() req: any, @Body() body: CreatePolicyDto) {
    return this.svc.createPolicy(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('policies/:id')
  @ApiOperation({ summary: 'Get allocation policy details' })
  async getPolicy(@Req() req: any, @Param('id') id: string) {
    return this.svc.getPolicy(id, req.user.workspaceId, req.user.userId);
  }

  @Put('policies/:id')
  @ApiOperation({ summary: 'Update allocation policy' })
  @ApiBody({ type: UpdatePolicyDto })
  async updatePolicy(@Req() req: any, @Param('id') id: string, @Body() body: UpdatePolicyDto) {
    return this.svc.updatePolicy(id, req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete('policies/:id')
  @ApiOperation({ summary: 'Soft delete allocation policy' })
  async deletePolicy(@Req() req: any, @Param('id') id: string) {
    return this.svc.deletePolicy(id, req.user.workspaceId, req.user.userId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Post('policies/:id/restore')
  @ApiOperation({ summary: 'Restore allocation policy' })
  async restorePolicy(@Req() req: any, @Param('id') id: string) {
    return this.svc.restorePolicy(id, req.user.workspaceId, req.user.userId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('reports')
  @ApiOperation({ summary: 'Get capital allocation reporting summary' })
  async reports(@Req() req: any, @Query() query: CapitalReportQueryDto) {
    return this.svc.getReports(req.user.workspaceId, query);
  }

  @Get('history')
  @ApiOperation({ summary: 'List capital allocation history' })
  async history(@Req() req: any, @Query() query: CapitalHistoryQueryDto) {
    return this.svc.getHistory(req.user.workspaceId, query);
  }
}
