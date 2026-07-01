import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  DecisionOverrideDto,
  ListSessionsQueryDto,
  StartDecisionDto,
  StreamQueryDto,
} from './dto/decision.dto';
import { DecisionService } from './decision.service';

@ApiTags('Decision Engine')
@Controller('decision')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DecisionController {
  constructor(private readonly svc: DecisionService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':sessionId') ----

  @Get('dashboard')
  @ApiOperation({ summary: 'Decision engine dashboard' })
  @ApiOkResponse({
    description: 'Aggregate decision session, mode, verdict and validation posture.',
  })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  // Decision sessions (Part A / C) ----------------------------------------

  @Post('sessions')
  @ApiOperation({ summary: 'Start a decision session (intake candidates, constraints, context)' })
  @ApiBody({ type: StartDecisionDto })
  @ApiOkResponse({ description: 'The created decision session.' })
  async startDecision(@Req() req: any, @Body() body: StartDecisionDto) {
    return this.svc.startDecision(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List decision sessions for the workspace' })
  @ApiOkResponse({ description: 'A page of decision sessions.' })
  async listSessions(@Req() req: any, @Query() query: ListSessionsQueryDto) {
    return this.svc.listSessions(req.user.workspaceId, query);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({
    summary: 'Get a decision session with candidates, constraints, context, verdicts',
  })
  @ApiOkResponse({ description: 'The decision session detail.' })
  async getSession(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.getSession(req.user.workspaceId, sessionId);
  }

  @Post('sessions/:sessionId/evaluate')
  @ApiOperation({ summary: 'Evaluate the candidates and produce the verdict (Part C)' })
  @ApiOkResponse({ description: 'The verdict with its decision outcome.' })
  async evaluateCandidates(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.evaluateCandidates(
      req.user.workspaceId,
      req.user.userId,
      sessionId,
      this.ctx(req),
    );
  }

  @Get('sessions/:sessionId/trace')
  @ApiOperation({ summary: 'Get the decision trace (verdict, winner, evaluations, alternatives)' })
  @ApiOkResponse({ description: 'The decision trace detail.' })
  async getTrace(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.getTrace(req.user.workspaceId, sessionId);
  }

  @Get('sessions/:sessionId/history')
  @ApiOperation({ summary: 'Get the immutable history for a decision session (Part F)' })
  @ApiOkResponse({ description: 'Recent decision history events.' })
  async getHistory(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listHistory(req.user.workspaceId, sessionId, query);
  }

  @Get('sessions/:sessionId/evidence')
  @ApiOperation({ summary: 'Get evidence for a decision session (Part C/F)' })
  @ApiOkResponse({ description: 'Recent decision evidence records.' })
  async getEvidence(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listEvidence(req.user.workspaceId, sessionId, query);
  }

  @Post('sessions/:sessionId/validate')
  @ApiOperation({ summary: 'Validate a decision session across six dimensions (Part D)' })
  @ApiOkResponse({ description: 'The decision validation result.' })
  async validateSession(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.validateSession(
      req.user.workspaceId,
      req.user.userId,
      sessionId,
      this.ctx(req),
    );
  }

  @Post('sessions/:sessionId/override')
  @ApiOperation({ summary: 'Apply an immutable founder override to a decision session (Part F)' })
  @ApiBody({ type: DecisionOverrideDto })
  @ApiOkResponse({ description: 'The overridden decision session.' })
  async override(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: DecisionOverrideDto,
  ) {
    return this.svc.override(req.user.workspaceId, req.user.userId, sessionId, body, this.ctx(req));
  }
}
