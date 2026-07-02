import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { SystemHealthService } from './system-health.service';

@ApiTags('D20 Systemic Health Monitor')
@Controller('health')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SystemHealthController {
  constructor(private readonly svc: SystemHealthService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Get('systems')
  @ApiOperation({ summary: 'List latest health per tracked subsystem' })
  @ApiOkResponse({ description: 'Health report across the 9 IW subsystems.' })
  async systems(@Req() req: any) {
    return this.svc.report(req.user.workspaceId);
  }

  @Get('report')
  @ApiOperation({ summary: 'Systemic health report' })
  @ApiOkResponse({ description: 'Aggregate systemic health.' })
  async report(@Req() req: any) {
    return this.svc.report(req.user.workspaceId);
  }

  @Post('check')
  @ApiOperation({ summary: 'Run a health probe across all subsystems' })
  @ApiOkResponse({ description: 'Fresh health records.' })
  async check(@Req() req: any) {
    return this.svc.check(req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Get('systems/:system')
  @ApiOperation({ summary: 'Health history for a single subsystem' })
  @ApiOkResponse({ description: 'Subsystem health history.' })
  async system(@Req() req: any, @Param('system') system: string) {
    return this.svc.getSystem(req.user.workspaceId, system);
  }
}
