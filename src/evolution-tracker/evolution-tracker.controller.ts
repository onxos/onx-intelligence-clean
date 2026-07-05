import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';
import {
  EvolutionTrackerService,
  EvolutionEventType,
  PredictionHorizon,
} from './evolution-tracker.service';

@ApiTags('Atlas V7 — Evolution Tracker')
@Controller('evolution-tracker')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EvolutionTrackerController {
  constructor(private readonly svc: EvolutionTrackerService) {}

  @Post('events')
  @RequirePermissions(Permission.ATLAS_EVOLUTION_WRITE)
  @ApiOperation({ summary: 'Log a system evolution event' })
  logEvent(
    @Body() body: { workspaceId: string; eventType: EvolutionEventType; description: string },
  ) {
    return this.svc.logEvent(body.workspaceId, body.eventType, body.description);
  }

  @Get('timeline')
  @RequirePermissions(Permission.ATLAS_EVOLUTION_READ)
  @ApiOperation({ summary: 'Get the system evolution timeline' })
  getTimeline(
    @Query('workspaceId') workspaceId: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getTimeline(workspaceId, since, limit ? parseInt(limit, 10) : 50);
  }

  @Get('predict')
  @RequirePermissions(Permission.ATLAS_EVOLUTION_READ)
  @ApiOperation({ summary: 'Predict future system state' })
  predict(
    @Query('workspaceId') workspaceId: string,
    @Query('horizon') horizon?: PredictionHorizon,
  ) {
    return this.svc.predict(workspaceId, horizon ?? '30d');
  }

  @Get('maturation-score')
  @RequirePermissions(Permission.ATLAS_EVOLUTION_READ)
  @ApiOperation({ summary: 'Get the platform maturation score' })
  getMaturationScore(@Query('workspaceId') workspaceId: string) {
    return this.svc.getMaturationScore(workspaceId);
  }
}
