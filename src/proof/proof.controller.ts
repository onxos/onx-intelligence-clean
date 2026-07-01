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
  CertifyProofDto,
  CreateProofScenarioDto,
  CreateProofSessionDto,
  CreateStressCampaignDto,
  CreateStressScenarioDto,
  DetectContradictionsDto,
  InjectFailureDto,
  ProofListQueryDto,
  RunProofDto,
  RunStressDto,
  StreamQueryDto,
  UpdateProofSessionDto,
} from './dto/proof.dto';
import { ProofService } from './proof.service';

@ApiTags('Proof & Certification')
@Controller('proof')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProofController {
  constructor(private readonly svc: ProofService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'Proof & certification posture dashboard for the workspace' })
  @ApiOkResponse({ description: 'Aggregate proof, certification and finding posture.' })
  async dashboard(@Req() req: any) {
    return this.svc.proofDashboard(req.user.workspaceId);
  }

  @Get('contradictions')
  @ApiOperation({ summary: 'List detected contradictions for the workspace (Part E)' })
  @ApiOkResponse({ description: 'Recent detected contradictions.' })
  async listContradictions(@Req() req: any, @Query() query: StreamQueryDto) {
    return this.svc.listContradictions(req.user.workspaceId, query);
  }

  @Post('contradictions')
  @ApiOperation({ summary: 'Detect contradictions across candidate assertions (Part E)' })
  @ApiBody({ type: DetectContradictionsDto })
  @ApiOkResponse({ description: 'The persisted contradictions.' })
  async detectContradictions(@Req() req: any, @Body() body: DetectContradictionsDto) {
    return this.svc.detectContradictions(
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get('executions/:executionId')
  @ApiOperation({ summary: 'Get a proof execution with results, findings and evidence' })
  @ApiOkResponse({ description: 'The proof execution detail.' })
  async getExecution(@Req() req: any, @Param('executionId') executionId: string) {
    return this.svc.getExecution(executionId, req.user.workspaceId);
  }

  // Proof sessions (Part A) ----------------------------------------------

  @Post('sessions')
  @ApiOperation({ summary: 'Create a proof session' })
  @ApiBody({ type: CreateProofSessionDto })
  @ApiOkResponse({ description: 'The created proof session.' })
  async createSession(@Req() req: any, @Body() body: CreateProofSessionDto) {
    return this.svc.createSession(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List proof sessions for the workspace' })
  @ApiOkResponse({ description: 'A paginated list of proof sessions.' })
  async listSessions(@Req() req: any, @Query() query: ProofListQueryDto) {
    return this.svc.listSessions(req.user.workspaceId, query);
  }

  @Post('sessions/:id/scenarios')
  @ApiOperation({ summary: 'Create a proof scenario on a session (Part F)' })
  @ApiBody({ type: CreateProofScenarioDto })
  @ApiOkResponse({ description: 'The created proof scenario.' })
  async createScenario(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateProofScenarioDto,
  ) {
    return this.svc.createScenario(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('sessions/:id/scenarios')
  @ApiOperation({ summary: 'List proof scenarios for a session (Part F)' })
  @ApiOkResponse({ description: 'The proof scenarios.' })
  async listScenarios(@Req() req: any, @Param('id') id: string) {
    return this.svc.listScenarios(id, req.user.workspaceId);
  }

  @Post('sessions/:id/run')
  @ApiOperation({ summary: 'Run the certification gates against a proof session (Part C)' })
  @ApiBody({ type: RunProofDto })
  @ApiOkResponse({ description: 'The proof execution and gate results.' })
  async runProof(@Req() req: any, @Param('id') id: string, @Body() body: RunProofDto) {
    return this.svc.runProof(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('sessions/:id/certify')
  @ApiOperation({ summary: 'Certify a proof session across all gates (Part G)' })
  @ApiBody({ type: CertifyProofDto })
  @ApiOkResponse({ description: 'The certification records and summary.' })
  async certify(@Req() req: any, @Param('id') id: string, @Body() body: CertifyProofDto) {
    return this.svc.certify(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('sessions/:id/findings')
  @ApiOperation({ summary: 'List findings for a proof session' })
  @ApiOkResponse({ description: 'The proof findings.' })
  async listFindings(@Req() req: any, @Param('id') id: string, @Query() query: StreamQueryDto) {
    return this.svc.listFindings(id, req.user.workspaceId, query);
  }

  @Get('sessions/:id/certifications')
  @ApiOperation({ summary: 'List certification records for a proof session (Part G)' })
  @ApiOkResponse({ description: 'The certification records.' })
  async listCertifications(@Req() req: any, @Param('id') id: string) {
    return this.svc.listCertifications(id, req.user.workspaceId);
  }

  @Get('sessions/:id/report')
  @ApiOperation({ summary: 'Certification report for a proof session (Part G)' })
  @ApiOkResponse({ description: 'The per-gate certification report.' })
  async report(@Req() req: any, @Param('id') id: string) {
    return this.svc.certificationReport(id, req.user.workspaceId);
  }

  @Get('sessions/:id/history')
  @ApiOperation({ summary: 'Immutable history for a proof session' })
  @ApiOkResponse({ description: 'The proof history entries.' })
  async history(@Req() req: any, @Param('id') id: string, @Query() query: StreamQueryDto) {
    return this.svc.listHistory(id, req.user.workspaceId, query);
  }

  @Get('sessions/:id/evidence')
  @ApiOperation({ summary: 'Evidence records for a proof session' })
  @ApiOkResponse({ description: 'The proof evidence entries.' })
  async evidence(@Req() req: any, @Param('id') id: string, @Query() query: StreamQueryDto) {
    return this.svc.listEvidence(id, req.user.workspaceId, query);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get a proof session with scenarios, executions and certifications' })
  @ApiOkResponse({ description: 'The proof session detail.' })
  async getSession(@Req() req: any, @Param('id') id: string) {
    return this.svc.getSession(id, req.user.workspaceId);
  }

  @Put('sessions/:id')
  @ApiOperation({ summary: 'Update a proof session' })
  @ApiBody({ type: UpdateProofSessionDto })
  @ApiOkResponse({ description: 'The updated proof session.' })
  async updateSession(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateProofSessionDto,
  ) {
    return this.svc.updateSession(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Archive (soft-delete) a proof session' })
  @ApiOkResponse({ description: 'The archive acknowledgement.' })
  async removeSession(@Req() req: any, @Param('id') id: string) {
    return this.svc.removeSession(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }
}

@ApiTags('Stress & Resilience')
@Controller('stress')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StressController {
  constructor(private readonly svc: ProofService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'Stress & resilience posture dashboard for the workspace' })
  @ApiOkResponse({ description: 'Aggregate stress, injection and recovery posture.' })
  async dashboard(@Req() req: any) {
    return this.svc.stressDashboard(req.user.workspaceId);
  }

  // Stress campaigns (Part B) --------------------------------------------

  @Post('campaigns')
  @ApiOperation({ summary: 'Create a stress campaign' })
  @ApiBody({ type: CreateStressCampaignDto })
  @ApiOkResponse({ description: 'The created stress campaign.' })
  async createCampaign(@Req() req: any, @Body() body: CreateStressCampaignDto) {
    return this.svc.createCampaign(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List stress campaigns for the workspace' })
  @ApiOkResponse({ description: 'A paginated list of stress campaigns.' })
  async listCampaigns(@Req() req: any, @Query() query: ProofListQueryDto) {
    return this.svc.listCampaigns(req.user.workspaceId, query);
  }

  @Post('campaigns/:id/scenarios')
  @ApiOperation({ summary: 'Create a stress scenario on a campaign (Part F)' })
  @ApiBody({ type: CreateStressScenarioDto })
  @ApiOkResponse({ description: 'The created stress scenario.' })
  async createScenario(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateStressScenarioDto,
  ) {
    return this.svc.createStressScenario(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get('campaigns/:id/scenarios')
  @ApiOperation({ summary: 'List stress scenarios for a campaign (Part F)' })
  @ApiOkResponse({ description: 'The stress scenarios.' })
  async listScenarios(@Req() req: any, @Param('id') id: string) {
    return this.svc.listStressScenarios(id, req.user.workspaceId);
  }

  @Post('campaigns/:id/run')
  @ApiOperation({ summary: 'Run the failure-injection battery against a campaign (Part D)' })
  @ApiBody({ type: RunStressDto })
  @ApiOkResponse({ description: 'The stress execution and injection results.' })
  async runStress(@Req() req: any, @Param('id') id: string, @Body() body: RunStressDto) {
    return this.svc.runStress(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('campaigns/:id/inject')
  @ApiOperation({ summary: 'Inject a single controlled failure into a campaign (Part D)' })
  @ApiBody({ type: InjectFailureDto })
  @ApiOkResponse({ description: 'The injection, recovery evidence and outcome.' })
  async inject(@Req() req: any, @Param('id') id: string, @Body() body: InjectFailureDto) {
    return this.svc.injectFailure(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('campaigns/:id/history')
  @ApiOperation({ summary: 'Immutable history for a stress campaign' })
  @ApiOkResponse({ description: 'The stress history entries.' })
  async history(@Req() req: any, @Param('id') id: string, @Query() query: StreamQueryDto) {
    return this.svc.listStressHistory(id, req.user.workspaceId, query);
  }

  @Get('campaigns/:id/evidence')
  @ApiOperation({ summary: 'Evidence records for a stress campaign' })
  @ApiOkResponse({ description: 'The stress evidence entries.' })
  async evidence(@Req() req: any, @Param('id') id: string, @Query() query: StreamQueryDto) {
    return this.svc.listStressEvidence(id, req.user.workspaceId, query);
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Get a stress campaign with scenarios, executions and injections' })
  @ApiOkResponse({ description: 'The stress campaign detail.' })
  async getCampaign(@Req() req: any, @Param('id') id: string) {
    return this.svc.getCampaign(id, req.user.workspaceId);
  }

  @Delete('campaigns/:id')
  @ApiOperation({ summary: 'Archive (soft-delete) a stress campaign' })
  @ApiOkResponse({ description: 'The archive acknowledgement.' })
  async removeCampaign(@Req() req: any, @Param('id') id: string) {
    return this.svc.removeCampaign(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }
}
