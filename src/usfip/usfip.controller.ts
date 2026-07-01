import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  CreatePolicyDto,
  CreateProtocolDto,
  CreateRuleDto,
  CreateSessionDto,
  ExecuteProtocolDto,
  InterpretDirectiveDto,
  ListQueryDto,
  OverrideDto,
  StreamQueryDto,
} from './dto/usfip.dto';
import { UsfipService } from './usfip.service';

@ApiTags('USFIP — Universal Strategic Founder Intelligence Protocol')
@Controller('usfip')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsfipController {
  constructor(private readonly svc: UsfipService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'USFIP strategic protocol posture dashboard' })
  @ApiOkResponse({
    description: 'Aggregate session, protocol, rule, policy and execution posture.',
  })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  // Protocol-scoped operations (literal 'protocols' segment) ---------------

  @Post('protocols/:protocolId/activate')
  @ApiOperation({ summary: 'Activate a protocol (Part C)' })
  @ApiOkResponse({ description: 'The activated protocol.' })
  async activateProtocol(@Req() req: any, @Param('protocolId') protocolId: string) {
    return this.svc.activateProtocol(
      req.user.workspaceId,
      req.user.userId,
      protocolId,
      this.ctx(req),
    );
  }

  @Get('protocols/:protocolId')
  @ApiOperation({ summary: 'Get a protocol with its rules and policies (Part A/C)' })
  @ApiOkResponse({ description: 'The protocol with ordered rules and policies.' })
  async getProtocol(@Req() req: any, @Param('protocolId') protocolId: string) {
    return this.svc.listProtocolComponents(req.user.workspaceId, protocolId);
  }

  @Get('protocols/:protocolId/validate')
  @ApiOperation({ summary: 'Validate a protocol against constitutional governance (Part D)' })
  @ApiOkResponse({ description: 'The governance validation result.' })
  async validateProtocol(@Req() req: any, @Param('protocolId') protocolId: string) {
    return this.svc.validateProtocol(req.user.workspaceId, protocolId);
  }

  @Post('protocols/:protocolId/execute')
  @ApiOperation({
    summary: 'Execute a protocol — select policy, order rules, derive path (Part C)',
  })
  @ApiBody({ type: ExecuteProtocolDto })
  @ApiOkResponse({ description: 'The protocol execution with the governed execution path.' })
  async executeProtocol(
    @Req() req: any,
    @Param('protocolId') protocolId: string,
    @Body() body: ExecuteProtocolDto,
  ) {
    return this.svc.executeProtocol(
      req.user.workspaceId,
      req.user.userId,
      protocolId,
      body,
      this.ctx(req),
    );
  }

  @Post('protocols/:protocolId/rules')
  @ApiOperation({ summary: 'Add a rule to a protocol (Part C rule management)' })
  @ApiBody({ type: CreateRuleDto })
  @ApiOkResponse({ description: 'The created rule.' })
  async createRule(
    @Req() req: any,
    @Param('protocolId') protocolId: string,
    @Body() body: CreateRuleDto,
  ) {
    return this.svc.createRule(
      req.user.workspaceId,
      req.user.userId,
      protocolId,
      body,
      this.ctx(req),
    );
  }

  @Post('protocols/:protocolId/policies')
  @ApiOperation({ summary: 'Add a policy to a protocol (Part C policy management)' })
  @ApiBody({ type: CreatePolicyDto })
  @ApiOkResponse({ description: 'The created policy.' })
  async createPolicy(
    @Req() req: any,
    @Param('protocolId') protocolId: string,
    @Body() body: CreatePolicyDto,
  ) {
    return this.svc.createPolicy(
      req.user.workspaceId,
      req.user.userId,
      protocolId,
      body,
      this.ctx(req),
    );
  }

  // Session lifecycle (Part A/B) ------------------------------------------

  @Post('sessions')
  @ApiOperation({ summary: 'Create a USFIP session and interpret founder intent (Part A/B)' })
  @ApiBody({ type: CreateSessionDto })
  @ApiOkResponse({ description: 'The created session with its strategic interpretation.' })
  async createSession(@Req() req: any, @Body() body: CreateSessionDto) {
    return this.svc.createSession(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List USFIP sessions for the workspace' })
  @ApiOkResponse({ description: 'A page of USFIP sessions.' })
  async listSessions(@Req() req: any, @Query() query: ListQueryDto) {
    return this.svc.listSessions(req.user.workspaceId, query);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get a session with its protocols and executions' })
  @ApiOkResponse({ description: 'The session detail.' })
  async getSession(@Req() req: any, @Param('id') id: string) {
    return this.svc.getSession(req.user.workspaceId, id);
  }

  @Post('sessions/:id/interpret')
  @ApiOperation({ summary: 'Re-interpret the founder directive for a session (Part B)' })
  @ApiBody({ type: InterpretDirectiveDto })
  @ApiOkResponse({ description: 'The updated session and interpretation.' })
  async interpret(@Req() req: any, @Param('id') id: string, @Body() body: InterpretDirectiveDto) {
    return this.svc.interpret(req.user.workspaceId, req.user.userId, id, body, this.ctx(req));
  }

  @Post('sessions/:id/protocols')
  @ApiOperation({ summary: 'Create a protocol under a session (Part A)' })
  @ApiBody({ type: CreateProtocolDto })
  @ApiOkResponse({ description: 'The created protocol.' })
  async createProtocol(@Req() req: any, @Param('id') id: string, @Body() body: CreateProtocolDto) {
    return this.svc.createProtocol(req.user.workspaceId, req.user.userId, id, body, this.ctx(req));
  }

  @Get('sessions/:id/history')
  @ApiOperation({ summary: 'Get immutable protocol history for a session (Part E)' })
  @ApiOkResponse({ description: 'Recent protocol history events.' })
  async getHistory(@Req() req: any, @Param('id') id: string, @Query() query: StreamQueryDto) {
    return this.svc.listHistory(req.user.workspaceId, id, query);
  }

  @Post('sessions/:id/override')
  @ApiOperation({ summary: 'Apply an immutable founder override to a session (Part D)' })
  @ApiBody({ type: OverrideDto })
  @ApiOkResponse({ description: 'The overridden session.' })
  async override(@Req() req: any, @Param('id') id: string, @Body() body: OverrideDto) {
    return this.svc.override(req.user.workspaceId, req.user.userId, id, body, this.ctx(req));
  }
}
