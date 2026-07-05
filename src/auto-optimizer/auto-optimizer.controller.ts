import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';
import { AutoOptimizerService, OptimizerTarget } from './auto-optimizer.service';

@ApiTags('Atlas V7 — Auto-Optimizer')
@Controller('auto-optimizer')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AutoOptimizerController {
  constructor(private readonly svc: AutoOptimizerService) {}

  @Get('analyze')
  @RequirePermissions(Permission.ATLAS_OPTIMIZER_READ)
  @ApiOperation({ summary: 'Analyze workspace for performance/cost/reliability optimizations' })
  analyze(@Query('workspaceId') workspaceId: string, @Query('target') target?: OptimizerTarget) {
    return this.svc.analyze(workspaceId, target ?? 'all');
  }

  @Post('apply')
  @RequirePermissions(Permission.ATLAS_OPTIMIZER_APPLY)
  @ApiOperation({ summary: 'Simulate or apply an optimization recommendation' })
  apply(@Body() body: { workspaceId: string; recommendationId: string; dryRun?: boolean }) {
    return this.svc.apply(body.recommendationId, body.dryRun ?? true);
  }
}
