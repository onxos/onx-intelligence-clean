import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SovereigntyService } from './sovereignty.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@ApiTags('Sovereignty')
@Controller('sovereignty')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class SovereigntyController {
  constructor(private readonly svc: SovereigntyService) {}

  @Post('evaluate')
  @RequirePermissions(Permission.CONSTITUTION_READ)
  @ApiOperation({ summary: 'Evaluate sovereignty for intent' })
  async evaluate(@Body() body: { intent: string }, @Req() req: any) {
    return this.svc.evaluate(body.intent, req.user.workspaceId);
  }

  @Get('report')
  @RequirePermissions(Permission.CONSTITUTION_READ)
  @ApiOperation({ summary: 'Get sovereignty report' })
  async report(@Req() req: any) {
    return this.svc.report(req.user.workspaceId);
  }
}
