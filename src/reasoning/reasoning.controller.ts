import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  ListSessionsQueryDto,
  ReasoningOverrideDto,
  StartReasoningDto,
  StreamQueryDto,
} from './dto/reasoning.dto';
import { ReasoningService } from './reasoning.service';

@ApiTags('Reasoning Engine')
@Controller('reasoning')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReasoningController {
  constructor(private readonly svc: ReasoningService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'Reasoning engine dashboard' })
  @ApiOkResponse({
    description: 'Aggregate reasoning session, mode, verdict and validation posture.',
  })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  // Reasoning sessions (Part A / C) ---------------------------------------

  @Post('sessions')
  @ApiOperation({ summary: 'Start a reasoning session and run the full chain (Part C)' })
  @ApiBody({ type: StartReasoningDto })
  @ApiOkResponse({ description: 'The completed reasoning session with its result and outcome.' })
  async startReasoning(@Req() req: any, @Body() body: StartReasoningDto) {
    return this.svc.startReasoning(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List reasoning sessions for the workspace' })
  @ApiOkResponse({ description: 'A page of reasoning sessions.' })
  async listSessions(@Req() req: any, @Query() query: ListSessionsQueryDto) {
    return this.svc.listSessions(req.user.workspaceId, query);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get a reasoning session with its result, context and chains' })
  @ApiOkResponse({ description: 'The reasoning session detail.' })
  async getSession(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.getSession(req.user.workspaceId, sessionId);
  }

  @Get('sessions/:sessionId/trace')
  @ApiOperation({ summary: 'Get the reasoning trace (chains + steps) for a session (Part C)' })
  @ApiOkResponse({ description: 'The full reasoning trace.' })
  async getTrace(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.getTrace(req.user.workspaceId, sessionId);
  }

  @Get('sessions/:sessionId/history')
  @ApiOperation({ summary: 'Get the immutable history for a reasoning session (Part F)' })
  @ApiOkResponse({ description: 'Recent reasoning history events.' })
  async getHistory(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listHistory(req.user.workspaceId, sessionId, query);
  }

  @Get('sessions/:sessionId/evidence')
  @ApiOperation({ summary: 'Get evidence for a reasoning session (Part C/F)' })
  @ApiOkResponse({ description: 'Recent reasoning evidence records.' })
  async getEvidence(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listEvidence(req.user.workspaceId, sessionId, query);
  }

  @Post('sessions/:sessionId/validate')
  @ApiOperation({ summary: 'Validate a reasoning session across five dimensions (Part D)' })
  @ApiOkResponse({ description: 'The reasoning validation result.' })
  async validateSession(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.validateSession(
      req.user.workspaceId,
      req.user.userId,
      sessionId,
      this.ctx(req),
    );
  }

  @Post('sessions/:sessionId/override')
  @ApiOperation({ summary: 'Apply an immutable founder override to a reasoning session (Part F)' })
  @ApiBody({ type: ReasoningOverrideDto })
  @ApiOkResponse({ description: 'The overridden reasoning session.' })
  async override(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: ReasoningOverrideDto,
  ) {
    return this.svc.override(req.user.workspaceId, req.user.userId, sessionId, body, this.ctx(req));
  }
}
