import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  ListSessionsQueryDto,
  PlanningOverrideDto,
  StartPlanningDto,
  StreamQueryDto,
} from './dto/planning.dto';
import { PlanningService } from './planning.service';

@ApiTags('Planning Engine')
@Controller('planning')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlanningController {
  constructor(private readonly svc: PlanningService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':sessionId') ----

  @Get('dashboard')
  @ApiOperation({ summary: 'Planning engine dashboard' })
  @ApiOkResponse({
    description: 'Aggregate planning session, mode, readiness and validation posture.',
  })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  // Planning sessions (Part A / C) ----------------------------------------

  @Post('sessions')
  @ApiOperation({ summary: 'Start a planning session (intake goals, constraints, context)' })
  @ApiBody({ type: StartPlanningDto })
  @ApiOkResponse({ description: 'The created planning session.' })
  async startPlanning(@Req() req: any, @Body() body: StartPlanningDto) {
    return this.svc.startPlanning(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List planning sessions for the workspace' })
  @ApiOkResponse({ description: 'A page of planning sessions.' })
  async listSessions(@Req() req: any, @Query() query: ListSessionsQueryDto) {
    return this.svc.listSessions(req.user.workspaceId, query);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get a planning session with goals, constraints, context and plans' })
  @ApiOkResponse({ description: 'The planning session detail.' })
  async getSession(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.getSession(req.user.workspaceId, sessionId);
  }

  @Post('sessions/:sessionId/generate')
  @ApiOperation({ summary: 'Generate the executable plan for a session (Part C)' })
  @ApiOkResponse({ description: 'The generated plan with its outcome.' })
  async generatePlan(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.generatePlan(req.user.workspaceId, req.user.userId, sessionId, this.ctx(req));
  }

  @Get('sessions/:sessionId/plan')
  @ApiOperation({ summary: 'Get the current plan (steps, milestones, alternatives) for a session' })
  @ApiOkResponse({ description: 'The current plan detail.' })
  async getPlan(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.getPlan(req.user.workspaceId, sessionId);
  }

  @Get('sessions/:sessionId/history')
  @ApiOperation({ summary: 'Get the immutable history for a planning session (Part F)' })
  @ApiOkResponse({ description: 'Recent planning history events.' })
  async getHistory(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listHistory(req.user.workspaceId, sessionId, query);
  }

  @Get('sessions/:sessionId/evidence')
  @ApiOperation({ summary: 'Get evidence for a planning session (Part C/F)' })
  @ApiOkResponse({ description: 'Recent planning evidence records.' })
  async getEvidence(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listEvidence(req.user.workspaceId, sessionId, query);
  }

  @Post('sessions/:sessionId/validate')
  @ApiOperation({ summary: 'Validate a planning session across six dimensions (Part D)' })
  @ApiOkResponse({ description: 'The planning validation result.' })
  async validateSession(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.validateSession(
      req.user.workspaceId,
      req.user.userId,
      sessionId,
      this.ctx(req),
    );
  }

  @Post('sessions/:sessionId/override')
  @ApiOperation({ summary: 'Apply an immutable founder override to a planning session (Part F)' })
  @ApiBody({ type: PlanningOverrideDto })
  @ApiOkResponse({ description: 'The overridden planning session.' })
  async override(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: PlanningOverrideDto,
  ) {
    return this.svc.override(req.user.workspaceId, req.user.userId, sessionId, body, this.ctx(req));
  }
}
