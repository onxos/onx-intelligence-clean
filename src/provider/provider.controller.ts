import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProviderService } from './provider.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@ApiTags('Provider')
@Controller('providers')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class ProviderController {
  constructor(private readonly svc: ProviderService) {}

  @Get()
  @RequirePermissions(Permission.AI_PROVIDER_MANAGE)
  @ApiOperation({ summary: 'List all providers' })
  async list(@Req() req: any) {
    return this.svc.findAll(req.user.workspaceId);
  }

  @Post('evaluate')
  @RequirePermissions(Permission.AI_PROVIDER_MANAGE)
  @ApiOperation({ summary: 'Evaluate provider via ISES' })
  async evaluate(@Body() body: { providerId: string; intent: string; context?: string }, @Req() req: any) {
    return this.svc.evaluate(body, { actorId: req.user.userId });
  }
}
