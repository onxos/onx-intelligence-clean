import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { ThrottlerGuard } from '../security/throttler.guard';
import { Throttle } from '../security/throttle.decorator';
import { THROTTLER_CONFIG } from '../security/throttler.config';
import { AiCoreService } from './ai-core.service';
import {
  AiChatDto,
  AiConsensusDto,
  AiQueryDto,
  AiQueryLogListDto,
  ClinicalDiagnosisDto,
  ClinicalProtocolDto,
} from './dto/ai-core.dto';

@ApiTags('AI Integration Core')
@Controller('ai')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle(THROTTLER_CONFIG.ai)
@ApiBearerAuth()
export class AiCoreController {
  constructor(private readonly svc: AiCoreService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Post('query')
  @ApiOperation({
    summary: 'Single constitutional AI query (SECH pre_execution gated, evidence-tiered)',
  })
  @ApiBody({ type: AiQueryDto })
  @ApiOkResponse({
    description: 'The gated, evidence-tiered AI response (or counter-proposal when blocked).',
  })
  async query(@Req() req: any, @Body() body: AiQueryDto) {
    return this.svc.query(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('consensus')
  @ApiOperation({ summary: 'Multi-model consensus query (top providers, 2/3 agreement)' })
  @ApiBody({ type: AiConsensusDto })
  @ApiOkResponse({ description: 'The consensus result across the top available providers.' })
  async consensus(@Req() req: any, @Body() body: AiConsensusDto) {
    return this.svc.consensus(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('chat')
  @ApiOperation({ summary: 'Conversational AI turn (SECH pre_execution gated)' })
  @ApiBody({ type: AiChatDto })
  @ApiOkResponse({ description: 'The gated AI chat response.' })
  async chat(@Req() req: any, @Body() body: AiChatDto) {
    return this.svc.chat(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('providers')
  @ApiOperation({ summary: 'List configured AI providers with priority and evidence tier' })
  @ApiOkResponse({ description: 'The provider registry.' })
  async providers() {
    return this.svc.listProviders();
  }

  @Get('providers/:id/status')
  @ApiOperation({ summary: 'Health/availability of a single provider' })
  @ApiOkResponse({ description: 'The provider status.' })
  async providerStatus(@Param('id') id: string) {
    return this.svc.providerStatus(id);
  }

  @Post('clinical/diagnosis')
  @ApiOperation({
    summary: 'Veterinary differential-diagnosis support (HC-02: not a final diagnosis)',
  })
  @ApiBody({ type: ClinicalDiagnosisDto })
  @ApiOkResponse({ description: 'Differential diagnosis support.' })
  async clinicalDiagnosis(@Req() req: any, @Body() body: ClinicalDiagnosisDto) {
    return this.svc.clinicalDiagnosis(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('clinical/protocol')
  @ApiOperation({ summary: 'Evidence-based protocol recommendation (decision support)' })
  @ApiBody({ type: ClinicalProtocolDto })
  @ApiOkResponse({ description: 'Protocol recommendation.' })
  async clinicalProtocol(@Req() req: any, @Body() body: ClinicalProtocolDto) {
    return this.svc.clinicalProtocol(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('logs')
  @ApiOperation({ summary: 'List AI query logs for the workspace (filter by domain, ficStatus)' })
  @ApiOkResponse({ description: 'Paginated AI query logs.' })
  async logs(@Req() req: any, @Query() query: AiQueryLogListDto) {
    return this.svc.listLogs(req.user.workspaceId, query);
  }
}
