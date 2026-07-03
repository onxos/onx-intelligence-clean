import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ToolService } from './tool.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

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
}
