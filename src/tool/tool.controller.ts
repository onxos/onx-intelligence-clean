import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ToolService } from './tool.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';
import { getRequestAuditContext } from '../common/audit-context.util';

@ApiTags('Tool')
@Controller('tools')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class ToolController {
  constructor(private readonly svc: ToolService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'List all tools' })
  async list(@Req() req: any) {
    return this.svc.findAll(req.user.workspaceId);
  }

  @Post(':id/invoke')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Invoke a tool via its real category integration' })
  async invoke(
    @Param('id') id: string,
    @Body() body: { method: string; params?: Record<string, any> },
    @Req() req: any,
  ) {
    return this.svc.invoke(req.user.workspaceId, id, body.method, body.params ?? {}, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }
}
