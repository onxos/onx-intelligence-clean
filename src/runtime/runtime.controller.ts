import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  AttachRuntimeContextDto,
  CreateRuntimeCheckpointDto,
  CreateRuntimePolicyDto,
  CreateRuntimeSessionDto,
  RecordRuntimeEventDto,
  RecoverRuntimeDto,
  RestoreCheckpointDto,
  RuntimeListQueryDto,
  RuntimeStreamQueryDto,
  TransitionRuntimeStateDto,
  UpdateRuntimeSessionDto,
} from './dto/runtime.dto';
import { RuntimeService } from './runtime.service';

@ApiTags('Intelligence Runtime')
@Controller('runtime')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RuntimeController {
  constructor(private readonly svc: RuntimeService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'Runtime posture dashboard for the workspace' })
  @ApiOkResponse({ description: 'Aggregate runtime state, health and recovery posture.' })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  // Session CRUD ----------------------------------------------------------

  @Post()
  @ApiOperation({ summary: 'Create a runtime session (Part A — runtime core)' })
  @ApiBody({ type: CreateRuntimeSessionDto })
  @ApiOkResponse({ description: 'The created runtime session (state CREATED).' })
  async create(@Req() req: any, @Body() body: CreateRuntimeSessionDto) {
    return this.svc.createSession(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get()
  @ApiOperation({ summary: 'List runtime sessions for the workspace' })
  @ApiOkResponse({ description: 'A paginated list of runtime sessions.' })
  async list(@Req() req: any, @Query() query: RuntimeListQueryDto) {
    return this.svc.listSessions(req.user.workspaceId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a runtime session with states, contexts, checkpoints and history' })
  @ApiOkResponse({ description: 'The runtime session and its related entities.' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getSession(id, req.user.workspaceId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a runtime session' })
  @ApiBody({ type: UpdateRuntimeSessionDto })
  @ApiOkResponse({ description: 'The updated runtime session.' })
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateRuntimeSessionDto) {
    return this.svc.updateSession(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete (archive) a runtime session' })
  @ApiOkResponse({ description: 'The archived session identity.' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.removeSession(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  // Part B — State machine ------------------------------------------------

  @Post(':id/state')
  @ApiOperation({ summary: 'Transition the runtime through its validated state machine' })
  @ApiBody({ type: TransitionRuntimeStateDto })
  @ApiOkResponse({ description: 'The runtime session at its new state.' })
  async transition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: TransitionRuntimeStateDto,
  ) {
    return this.svc.transitionState(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  // Part C — Runtime objects (contexts) -----------------------------------

  @Post(':id/contexts')
  @ApiOperation({ summary: 'Attach a runtime context object to a session' })
  @ApiBody({ type: AttachRuntimeContextDto })
  @ApiOkResponse({ description: 'The attached runtime context (new version).' })
  async attachContext(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AttachRuntimeContextDto,
  ) {
    return this.svc.attachContext(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get(':id/contexts')
  @ApiOperation({ summary: 'List active runtime context objects for a session' })
  @ApiOkResponse({ description: 'The active runtime contexts.' })
  async listContexts(@Req() req: any, @Param('id') id: string) {
    return this.svc.listContexts(id, req.user.workspaceId);
  }

  // Events + history + continuity (Part E) --------------------------------

  @Post(':id/events')
  @ApiOperation({ summary: 'Record a runtime event (heartbeat, error, etc.)' })
  @ApiBody({ type: RecordRuntimeEventDto })
  @ApiOkResponse({ description: 'The recorded runtime event.' })
  async recordEvent(@Req() req: any, @Param('id') id: string, @Body() body: RecordRuntimeEventDto) {
    return this.svc.recordEvent(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Runtime event stream for a session' })
  @ApiOkResponse({ description: 'Chronological runtime events (newest first).' })
  async listEvents(
    @Req() req: any,
    @Param('id') id: string,
    @Query() query: RuntimeStreamQueryDto,
  ) {
    return this.svc.listEvents(id, req.user.workspaceId, query);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Immutable runtime history for a session' })
  @ApiOkResponse({ description: 'Chronological runtime history events.' })
  async history(@Req() req: any, @Param('id') id: string, @Query() query: RuntimeStreamQueryDto) {
    return this.svc.history(id, req.user.workspaceId, query);
  }

  @Get(':id/continuity')
  @ApiOperation({ summary: 'Runtime continuity: lineage, state history and recoveries' })
  @ApiOkResponse({ description: 'The continuity lineage and history for a session.' })
  async continuity(@Req() req: any, @Param('id') id: string) {
    return this.svc.continuity(id, req.user.workspaceId);
  }

  // Part D — Checkpoints / snapshots / recovery ---------------------------

  @Post(':id/checkpoints')
  @ApiOperation({ summary: 'Create a runtime checkpoint capturing current contexts and state' })
  @ApiBody({ type: CreateRuntimeCheckpointDto })
  @ApiOkResponse({ description: 'The created runtime checkpoint.' })
  async createCheckpoint(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateRuntimeCheckpointDto,
  ) {
    return this.svc.createCheckpoint(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get(':id/checkpoints')
  @ApiOperation({ summary: 'List runtime checkpoints for a session' })
  @ApiOkResponse({ description: 'The runtime checkpoints (newest first).' })
  async listCheckpoints(@Req() req: any, @Param('id') id: string) {
    return this.svc.listCheckpoints(id, req.user.workspaceId);
  }

  @Post(':id/checkpoints/:checkpointId/restore')
  @ApiOperation({ summary: 'Restore a runtime session from a checkpoint' })
  @ApiBody({ type: RestoreCheckpointDto })
  @ApiOkResponse({ description: 'The recovery record and the restored session.' })
  async restoreCheckpoint(
    @Req() req: any,
    @Param('id') id: string,
    @Param('checkpointId') checkpointId: string,
    @Body() body: RestoreCheckpointDto,
  ) {
    return this.svc.restoreCheckpoint(
      id,
      checkpointId,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Post(':id/snapshots')
  @ApiOperation({ summary: 'Capture a full runtime snapshot' })
  @ApiOkResponse({ description: 'The created runtime snapshot.' })
  async createSnapshot(@Req() req: any, @Param('id') id: string) {
    return this.svc.createSnapshot(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Post(':id/recover')
  @ApiOperation({ summary: 'Recover a runtime session (checkpoint/rollback/crash/continuity)' })
  @ApiBody({ type: RecoverRuntimeDto })
  @ApiOkResponse({ description: 'The recovery record and the recovered session.' })
  async recover(@Req() req: any, @Param('id') id: string, @Body() body: RecoverRuntimeDto) {
    return this.svc.recover(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a paused/stopped runtime session' })
  @ApiBody({ type: RestoreCheckpointDto })
  @ApiOkResponse({ description: 'The recovery record and the resumed session.' })
  async resume(@Req() req: any, @Param('id') id: string, @Body() body: RestoreCheckpointDto) {
    return this.svc.resume(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get(':id/recoveries')
  @ApiOperation({ summary: 'Recovery history for a session' })
  @ApiOkResponse({ description: 'The recovery records (newest first).' })
  async recoveryHistory(@Req() req: any, @Param('id') id: string) {
    return this.svc.recoveryHistory(id, req.user.workspaceId);
  }

  // Part F — Governance (policy + health) ---------------------------------

  @Post(':id/policies')
  @ApiOperation({ summary: 'Set a runtime governance policy for a session' })
  @ApiBody({ type: CreateRuntimePolicyDto })
  @ApiOkResponse({ description: 'The created runtime policy.' })
  async createPolicy(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateRuntimePolicyDto,
  ) {
    return this.svc.createPolicy(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get(':id/policies')
  @ApiOperation({ summary: 'List runtime governance policies for a session' })
  @ApiOkResponse({ description: 'The runtime policies (newest first).' })
  async listPolicies(@Req() req: any, @Param('id') id: string) {
    return this.svc.listPolicies(id, req.user.workspaceId);
  }

  @Get(':id/health')
  @ApiOperation({ summary: 'Evaluate and return runtime health for a session' })
  @ApiOkResponse({ description: 'The computed runtime health posture.' })
  async health(@Req() req: any, @Param('id') id: string) {
    return this.svc.health(id, req.user.workspaceId);
  }
}
