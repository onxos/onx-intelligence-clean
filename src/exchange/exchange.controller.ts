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
  CreateExchangeDto,
  CreateExchangePolicyDto,
  CreateExchangeSessionDto,
  ExchangeListQueryDto,
  ExchangeStreamQueryDto,
  RecordExchangeMessageDto,
  ReplayExchangeDto,
  RollbackExchangeDto,
  SubmitExchangeDto,
  UpdateExchangeSessionDto,
  ValidateExchangeDto,
} from './dto/exchange.dto';
import { ExchangeService } from './exchange.service';

@ApiTags('Intelligence Exchange')
@Controller('exchange')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExchangeController {
  constructor(private readonly svc: ExchangeService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'Exchange posture dashboard for the workspace' })
  @ApiOkResponse({ description: 'Aggregate exchange stage, trust and completion posture.' })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  // Exchange sessions (Part A) -------------------------------------------

  @Post('sessions')
  @ApiOperation({ summary: 'Create an exchange session' })
  @ApiBody({ type: CreateExchangeSessionDto })
  @ApiOkResponse({ description: 'The created exchange session.' })
  async createSession(@Req() req: any, @Body() body: CreateExchangeSessionDto) {
    return this.svc.createSession(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List exchange sessions for the workspace' })
  @ApiOkResponse({ description: 'A paginated list of exchange sessions.' })
  async listSessions(@Req() req: any, @Query() query: ExchangeListQueryDto) {
    return this.svc.listSessions(req.user.workspaceId, query);
  }

  @Post('sessions/:sessionId/policies')
  @ApiOperation({ summary: 'Set an exchange governance policy on a session (Part G)' })
  @ApiBody({ type: CreateExchangePolicyDto })
  @ApiOkResponse({ description: 'The created exchange policy.' })
  async createPolicy(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: CreateExchangePolicyDto,
  ) {
    return this.svc.createPolicy(
      sessionId,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get('sessions/:sessionId/policies')
  @ApiOperation({ summary: 'List exchange governance policies for a session' })
  @ApiOkResponse({ description: 'The exchange policies (newest first).' })
  async listPolicies(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.listPolicies(sessionId, req.user.workspaceId);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get an exchange session with its transactions and policies' })
  @ApiOkResponse({ description: 'The exchange session and related entities.' })
  async getSession(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.getSession(sessionId, req.user.workspaceId);
  }

  @Put('sessions/:sessionId')
  @ApiOperation({ summary: 'Update an exchange session' })
  @ApiBody({ type: UpdateExchangeSessionDto })
  @ApiOkResponse({ description: 'The updated exchange session.' })
  async updateSession(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateExchangeSessionDto,
  ) {
    return this.svc.updateSession(
      sessionId,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Soft delete (archive) an exchange session' })
  @ApiOkResponse({ description: 'The archived session identity.' })
  async removeSession(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.svc.removeSession(sessionId, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  // Exchange transactions (Part A/B/C/D/E) --------------------------------

  @Post()
  @ApiOperation({ summary: 'Create an exchange transaction (INTEND) and seal its envelope' })
  @ApiBody({ type: CreateExchangeDto })
  @ApiOkResponse({ description: 'The created exchange transaction at INTEND.' })
  async create(@Req() req: any, @Body() body: CreateExchangeDto) {
    return this.svc.createExchange(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get()
  @ApiOperation({ summary: 'List exchange transactions for the workspace' })
  @ApiOkResponse({ description: 'A paginated list of exchange transactions.' })
  async list(@Req() req: any, @Query() query: ExchangeListQueryDto) {
    return this.svc.listExchanges(req.user.workspaceId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an exchange transaction with envelopes, messages, receipts and lineage',
  })
  @ApiOkResponse({ description: 'The exchange transaction and its related entities.' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getExchange(id, req.user.workspaceId);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit an exchange through the full validated pipeline (Part B)' })
  @ApiBody({ type: SubmitExchangeDto })
  @ApiOkResponse({ description: 'The pipeline result and final transaction state.' })
  async submit(@Req() req: any, @Param('id') id: string, @Body() body: SubmitExchangeDto) {
    return this.svc.submitExchange(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Current exchange stage, status and trust posture' })
  @ApiOkResponse({ description: 'The exchange status snapshot.' })
  async status(@Req() req: any, @Param('id') id: string) {
    return this.svc.status(id, req.user.workspaceId);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Immutable exchange history for a transaction' })
  @ApiOkResponse({ description: 'Chronological exchange history events.' })
  async history(@Req() req: any, @Param('id') id: string, @Query() query: ExchangeStreamQueryDto) {
    return this.svc.history(id, req.user.workspaceId, query);
  }

  @Get(':id/lineage')
  @ApiOperation({ summary: 'Exchange lineage: origin, destination, parent and children (Part E)' })
  @ApiOkResponse({ description: 'The lineage records and child exchanges.' })
  async lineage(@Req() req: any, @Param('id') id: string) {
    return this.svc.lineage(id, req.user.workspaceId);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Exchange validation/audit records for a transaction' })
  @ApiOkResponse({ description: 'The exchange audit records (newest first).' })
  async audit(@Req() req: any, @Param('id') id: string) {
    return this.svc.auditTrail(id, req.user.workspaceId);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Run the constitutional validation engine for a transaction (Part F)' })
  @ApiBody({ type: ValidateExchangeDto })
  @ApiOkResponse({ description: 'The validation result across every dimension.' })
  async validate(@Req() req: any, @Param('id') id: string, @Body() body: ValidateExchangeDto) {
    return this.svc.validate(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post(':id/replay')
  @ApiOperation({ summary: 'Replay a completed/failed exchange through the pipeline (Part G)' })
  @ApiBody({ type: ReplayExchangeDto })
  @ApiOkResponse({ description: 'The replayed pipeline result.' })
  async replay(@Req() req: any, @Param('id') id: string, @Body() body: ReplayExchangeDto) {
    return this.svc.replay(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post(':id/rollback')
  @ApiOperation({ summary: 'Roll back an exchange transaction (Part G)' })
  @ApiBody({ type: RollbackExchangeDto })
  @ApiOkResponse({ description: 'The rolled-back transaction.' })
  async rollback(@Req() req: any, @Param('id') id: string, @Body() body: RollbackExchangeDto) {
    return this.svc.rollback(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Record an exchange message on a transaction' })
  @ApiBody({ type: RecordExchangeMessageDto })
  @ApiOkResponse({ description: 'The recorded exchange message.' })
  async recordMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: RecordExchangeMessageDto,
  ) {
    return this.svc.recordMessage(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'List exchange messages for a transaction' })
  @ApiOkResponse({ description: 'The exchange messages (ordered by sequence).' })
  async listMessages(@Req() req: any, @Param('id') id: string) {
    return this.svc.listMessages(id, req.user.workspaceId);
  }

  @Get(':id/receipts')
  @ApiOperation({ summary: 'List exchange receipts for a transaction' })
  @ApiOkResponse({ description: 'The exchange receipts (newest first).' })
  async listReceipts(@Req() req: any, @Param('id') id: string) {
    return this.svc.listReceipts(id, req.user.workspaceId);
  }
}
