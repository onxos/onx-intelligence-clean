import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { Permission } from '../../rbac/permissions.enum';
import { RbacGuard, RequirePermissions } from '../../rbac/rbac.guard';
import { RevenueCycleService } from './revenue-cycle.service';

@ApiTags('Financial')
@Controller('financial/revenue')
@UseGuards(JwtAuthGuard, RbacGuard)
export class RevenueCycleController {
  constructor(private readonly service: RevenueCycleService) {}

  @Get('summary')
  @RequirePermissions(Permission.BILLING_READ)
  summary(
    @Req() req: { user: { workspaceId: string } },
    @Query('period') period = new Date().toISOString().slice(0, 7),
  ) {
    return this.service.summary(req.user.workspaceId, period);
  }

  @Get('aging')
  @RequirePermissions(Permission.BILLING_READ)
  aging(@Req() req: { user: { workspaceId: string } }, @Query('period') period?: string) {
    return this.service.aging(req.user.workspaceId, period);
  }

  @Get('trends')
  @RequirePermissions(Permission.BILLING_READ)
  trends(@Req() req: { user: { workspaceId: string } }) {
    return this.service.trends(req.user.workspaceId);
  }

  @Post('generate')
  @RequirePermissions(Permission.BILLING_CREATE)
  generate(
    @Req() req: { user: { workspaceId: string } },
    @Query('period') period = new Date().toISOString().slice(0, 7),
  ) {
    return this.service.generate(req.user.workspaceId, period);
  }
}
