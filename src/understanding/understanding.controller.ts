import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { ContextMatchingService } from './context-matching.service';
import { MeaningExtractionService } from './meaning-extraction.service';
import { PatternDetectionService } from './pattern-detection.service';
import { UnderstandingService } from './understanding.service';
import {
  DetectPatternsDto,
  ExtractMeaningDto,
  MatchContextDto,
  RunPipelineDto,
  UnderstandingListQueryDto,
} from './dto/understanding.dto';

@ApiTags('Perception → Understanding')
@Controller('understanding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UnderstandingController {
  constructor(
    private readonly understanding: UnderstandingService,
    private readonly t1: PatternDetectionService,
    private readonly t2: ContextMatchingService,
    private readonly t3: MeaningExtractionService,
  ) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Post('transform/t1')
  @ApiOperation({ summary: 'T1 — Pattern Detection (SC-05: 3+ occurrences)' })
  @ApiBody({ type: DetectPatternsDto })
  @ApiOkResponse({ description: 'The detected pattern.' })
  async t1Detect(@Req() req: any, @Body() body: DetectPatternsDto) {
    return this.t1.detectPatterns(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('transform/t2')
  @ApiOperation({ summary: 'T2 — Context Matching (SC-08: 2+ sources)' })
  @ApiBody({ type: MatchContextDto })
  @ApiOkResponse({ description: 'The contextualized pattern.' })
  async t2Context(@Req() req: any, @Body() body: MatchContextDto) {
    return this.t2.matchContext(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('transform/t3')
  @ApiOperation({ summary: 'T3 — Meaning Extraction (HC-10: explicit interpretation)' })
  @ApiBody({ type: ExtractMeaningDto })
  @ApiOkResponse({ description: 'The understanding object.' })
  async t3Meaning(@Req() req: any, @Body() body: ExtractMeaningDto) {
    return this.t3.extractMeaning(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('pipeline')
  @ApiOperation({ summary: 'Run the full T1 → T2 → T3 perception-to-understanding pipeline' })
  @ApiBody({ type: RunPipelineDto })
  @ApiOkResponse({
    description: 'Pattern + context + understanding (stops at the first non-passing gate).',
  })
  async pipeline(@Req() req: any, @Body() body: RunPipelineDto) {
    return this.understanding.runPipeline(
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get('patterns')
  @ApiOperation({ summary: 'List detected patterns (T1)' })
  @ApiOkResponse({ description: 'Paginated detected patterns.' })
  async patterns(@Req() req: any, @Query() query: UnderstandingListQueryDto) {
    return this.understanding.listPatterns(req.user.workspaceId, query);
  }

  @Get('contexts')
  @ApiOperation({ summary: 'List contextualized patterns (T2)' })
  @ApiOkResponse({ description: 'Paginated contextualized patterns.' })
  async contexts(@Req() req: any, @Query() query: UnderstandingListQueryDto) {
    return this.understanding.listContexts(req.user.workspaceId, query);
  }

  @Get('objects')
  @ApiOperation({ summary: 'List understanding objects (T3)' })
  @ApiOkResponse({ description: 'Paginated understanding objects.' })
  async objects(@Req() req: any, @Query() query: UnderstandingListQueryDto) {
    return this.understanding.listObjects(req.user.workspaceId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Perception → Understanding transformation statistics' })
  @ApiOkResponse({ description: 'Transform counts + reality-tier distribution.' })
  async stats(@Req() req: any) {
    return this.understanding.stats(req.user.workspaceId);
  }
}
