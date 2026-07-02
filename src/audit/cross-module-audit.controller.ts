import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { CrossModuleAuditService } from './cross-module-audit.service';

@ApiTags('D17 Cross-Module Audit')
@Controller('audit')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CrossModuleAuditController {
  constructor(private readonly svc: CrossModuleAuditService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Post('run')
  @ApiOperation({ summary: 'Run a cross-module consistency audit (reports, does not repair)' })
  @ApiOkResponse({ description: 'The audit result with detected inconsistencies.' })
  async run(@Req() req: any) {
    return this.svc.run(req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Get('inconsistencies')
  @ApiOperation({ summary: 'List currently-detected cross-module inconsistencies' })
  @ApiOkResponse({ description: 'Live inconsistencies.' })
  async inconsistencies(@Req() req: any) {
    return this.svc.listInconsistencies(req.user.workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a cross-module audit result' })
  @ApiOkResponse({ description: 'The audit.' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getById(id, req.user.workspaceId);
  }
}
