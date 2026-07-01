import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  ArbitrateDto,
  CreateOrchestrationDto,
  CreatePolicyDto,
  ListQueryDto,
  MergeRequestDto,
  MergeRollbackDto,
  OverrideDto,
  RouteDto,
  StartOrchestrationDto,
  StreamQueryDto,
} from './dto/meta.dto';
import { MetaService } from './meta.service';

@ApiTags('Meta-Intelligence Orchestration')
@Controller('meta')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MetaController {
  constructor(private readonly svc: MetaService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'Meta-orchestration posture dashboard (Part F coordination)' })
  @ApiOkResponse({
    description: 'Aggregate orchestration, routing, arbitration, merge and coordination posture.',
  })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  @Get('policies')
  @ApiOperation({ summary: 'List governance policies (Part G)' })
  @ApiOkResponse({ description: 'Routing, arbitration, merge and execution policies.' })
  async listPolicies(@Req() req: any) {
    return this.svc.listPolicies(req.user.workspaceId);
  }

  @Post('policies')
  @ApiOperation({ summary: 'Create a governance policy (Part G)' })
  @ApiBody({ type: CreatePolicyDto })
  @ApiOkResponse({ description: 'The created policy reference.' })
  async createPolicy(@Req() req: any, @Body() body: CreatePolicyDto) {
    return this.svc.createPolicy(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('merges/:mergeId/commit')
  @ApiOperation({ summary: 'Commit a validated merge (Part D)' })
  @ApiOkResponse({ description: 'The committed merge request.' })
  async commitMerge(@Req() req: any, @Param('mergeId') mergeId: string) {
    return this.svc.commitMerge(req.user.workspaceId, req.user.userId, mergeId, this.ctx(req));
  }

  @Post('merges/:mergeId/rollback')
  @ApiOperation({ summary: 'Roll back a merge (Part D)' })
  @ApiBody({ type: MergeRollbackDto })
  @ApiOkResponse({ description: 'The rolled-back merge request.' })
  async rollbackMerge(
    @Req() req: any,
    @Param('mergeId') mergeId: string,
    @Body() body: MergeRollbackDto,
  ) {
    return this.svc.rollbackMerge(
      req.user.workspaceId,
      req.user.userId,
      mergeId,
      body,
      this.ctx(req),
    );
  }

  // Orchestration lifecycle (Part A) --------------------------------------

  @Post('orchestrations')
  @ApiOperation({ summary: 'Create a meta-orchestration session (Part A)' })
  @ApiBody({ type: CreateOrchestrationDto })
  @ApiOkResponse({ description: 'The created orchestration session.' })
  async create(@Req() req: any, @Body() body: CreateOrchestrationDto) {
    return this.svc.createOrchestration(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('orchestrations')
  @ApiOperation({ summary: 'List meta-orchestration sessions for the workspace' })
  @ApiOkResponse({ description: 'A page of orchestration sessions.' })
  async list(@Req() req: any, @Query() query: ListQueryDto) {
    return this.svc.listSessions(req.user.workspaceId, query);
  }

  @Get('orchestrations/:id')
  @ApiOperation({ summary: 'Get an orchestration session with plans and overrides' })
  @ApiOkResponse({ description: 'The orchestration session detail.' })
  async getSession(@Req() req: any, @Param('id') id: string) {
    return this.svc.getSession(req.user.workspaceId, id);
  }

  @Post('orchestrations/:id/start')
  @ApiOperation({ summary: 'Start orchestration — build and route the execution plan (Part A/B)' })
  @ApiBody({ type: StartOrchestrationDto })
  @ApiOkResponse({ description: 'The started execution plan and state.' })
  async start(@Req() req: any, @Param('id') id: string, @Body() body: StartOrchestrationDto) {
    return this.svc.startOrchestration(
      req.user.workspaceId,
      req.user.userId,
      id,
      body,
      this.ctx(req),
    );
  }

  @Get('orchestrations/:id/plan')
  @ApiOperation({ summary: 'Get the latest execution plan and steps (Part A)' })
  @ApiOkResponse({ description: 'The execution plan with ordered steps.' })
  async getPlan(@Req() req: any, @Param('id') id: string) {
    return this.svc.getExecutionPlan(req.user.workspaceId, id);
  }

  @Get('orchestrations/:id/state')
  @ApiOperation({ summary: 'Get the current execution state (Part A)' })
  @ApiOkResponse({ description: 'The latest execution state.' })
  async getState(@Req() req: any, @Param('id') id: string) {
    return this.svc.getExecutionState(req.user.workspaceId, id);
  }

  @Get('orchestrations/:id/history')
  @ApiOperation({ summary: 'Get immutable execution history (Part A audit)' })
  @ApiOkResponse({ description: 'Recent execution history events.' })
  async getHistory(@Req() req: any, @Param('id') id: string, @Query() query: StreamQueryDto) {
    return this.svc.listHistory(req.user.workspaceId, id, query);
  }

  @Post('orchestrations/:id/route')
  @ApiOperation({ summary: 'Resolve a constitutional routing decision (Part B)' })
  @ApiBody({ type: RouteDto })
  @ApiOkResponse({ description: 'The persisted routing decision.' })
  async route(@Req() req: any, @Param('id') id: string, @Body() body: RouteDto) {
    return this.svc.route(req.user.workspaceId, req.user.userId, id, body, this.ctx(req));
  }

  @Post('orchestrations/:id/arbitrate')
  @ApiOperation({ summary: 'Arbitrate competing execution paths (Part C)' })
  @ApiBody({ type: ArbitrateDto })
  @ApiOkResponse({ description: 'The arbitration record with winning and losing paths.' })
  async arbitrate(@Req() req: any, @Param('id') id: string, @Body() body: ArbitrateDto) {
    return this.svc.arbitrate(req.user.workspaceId, req.user.userId, id, body, this.ctx(req));
  }

  @Post('orchestrations/:id/merge')
  @ApiOperation({ summary: 'Request a merge of execution paths (Part D)' })
  @ApiBody({ type: MergeRequestDto })
  @ApiOkResponse({ description: 'The persisted merge request.' })
  async merge(@Req() req: any, @Param('id') id: string, @Body() body: MergeRequestDto) {
    return this.svc.requestMerge(req.user.workspaceId, req.user.userId, id, body, this.ctx(req));
  }

  @Get('orchestrations/:id/merges')
  @ApiOperation({ summary: 'List merge requests for a session (Part D)' })
  @ApiOkResponse({ description: 'Recent merge requests.' })
  async listMerges(@Req() req: any, @Param('id') id: string, @Query() query: StreamQueryDto) {
    return this.svc.listMerges(req.user.workspaceId, id, query);
  }

  @Post('orchestrations/:id/override')
  @ApiOperation({ summary: 'Apply an immutable founder override (Part E)' })
  @ApiBody({ type: OverrideDto })
  @ApiOkResponse({ description: 'The immutable override event.' })
  async override(@Req() req: any, @Param('id') id: string, @Body() body: OverrideDto) {
    return this.svc.override(req.user.workspaceId, req.user.userId, id, body, this.ctx(req));
  }
}
