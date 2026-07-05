import { Controller, Get, Post, Body, Query, Param, Req, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceSchedulerService } from './intelligence-scheduler.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@ApiTags('Intelligence')
@Controller('intelligence')
@UseGuards(RbacGuard, JwtAuthGuard)
@ApiBearerAuth()
export class IntelligenceController {
  constructor(
    private readonly svc: IntelligenceService,
    private readonly scheduler: IntelligenceSchedulerService,
  ) {}

  @Post()
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Create intelligence object' })
  async create(@Body() body: any, @Req() req: any) {
    return this.svc.create(body);
  }

  @Get()
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'List intelligence objects' })
  async list(@Query() query: any, @Req() req: any) {
    return this.svc.findAll(req.user.workspaceId, query);
  }

  @Get('stats')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Get intelligence statistics' })
  async stats(@Req() req: any) {
    return this.svc.stats(req.user.workspaceId);
  }

  @Get('quality-indices')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Live Intelligence Capital Index / Institutional Risk Score' })
  async qualityIndices(@Req() req: any) {
    return this.svc.qualityIndices(req.user.workspaceId);
  }

  @Get('governance-log')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Recent autonomous-scheduler governance events' })
  async governanceLog(@Req() req: any, @Query('limit') limit?: string) {
    return this.svc.governanceLog(req.user.workspaceId, limit ? Number(limit) : undefined);
  }

  @Get('scheduler/status')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Autonomous background scheduler job status' })
  async schedulerStatus() {
    return this.scheduler.getStatus();
  }

  @Post('answer-from-knowledge')
  @HttpCode(200)
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Search internal knowledge first, then fallback external' })
  async answerFromKnowledge(@Req() req: any, @Body() body: { question: string }) {
    return this.svc.answerFromKnowledge(req.user.workspaceId, req.user.userId, body?.question);
  }

  @Post('ingest-knowledge-asset')
  @HttpCode(200)
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Ingest a canonical Q&A knowledge asset' })
  async ingestKnowledgeAsset(
    @Req() req: any,
    @Body()
    body: {
      question: string;
      answer: string;
      confidence_score?: number;
      constitutional_amanah?: number;
      asset_value_usd?: number;
      source?: string;
    },
  ) {
    return this.svc.ingestKnowledgeAsset(req.user.workspaceId, req.user.userId, body);
  }

  @Get('self-sufficiency-metrics')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Track self sufficiency based on internal vs external answers' })
  async getSelfSufficiencyMetrics(@Req() req: any, @Query('days') days?: string) {
    return this.svc.getSelfSufficiencyMetrics(req.user.workspaceId, days ? Number(days) : 30);
  }

  @Get('knowledge-value')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Calculate corpus monetary value from knowledge assets' })
  async calculateKnowledgeValue(@Req() req: any) {
    return this.svc.calculateKnowledgeValue(req.user.workspaceId);
  }

  @Post('constitutional-audit')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Run 7-principles constitutional audit for AI interactions' })
  async runConstitutionalAudit(@Req() req: any) {
    return this.svc.runConstitutionalAudit(req.user.workspaceId);
  }

  @Get('provider-comparison')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Provider cost and latency comparison for optimization' })
  async getProviderComparison(@Req() req: any) {
    return this.svc.getProviderComparison(req.user.workspaceId);
  }

  @Get(':id')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Get single intelligence object' })
  async get(@Param('id') id: string, @Req() req: any) {
    return this.svc.findOne(id, req.user.workspaceId, req.user.userId);
  }
}
