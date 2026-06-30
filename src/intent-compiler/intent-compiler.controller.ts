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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { IntentCompilerService } from './intent-compiler.service';
import {
  ApproveIntentDto,
  CompareVersionsQueryDto,
  ConflictListQueryDto,
  CreateFounderIntentDto,
  CreateRelationshipDto,
  CreateReviewDto,
  FounderIntentListQueryDto,
  OverrideIntentDto,
  ResolveConflictDto,
  TransitionLifecycleDto,
  UpdateFounderIntentDto,
  VersionFounderIntentDto,
} from './dto/intent-compiler.dto';

@ApiTags('Founder Intent Compiler')
@Controller('founder-intent-compiler')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IntentCompilerController {
  constructor(private readonly svc: IntentCompilerService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Intent CRUD ----------------------------------------------------------

  @Post('intents')
  @ApiOperation({ summary: 'Create a canonical founder intent (lifecycle DRAFT)' })
  @ApiBody({ type: CreateFounderIntentDto })
  @ApiOkResponse({ description: 'The created founder intent with its initial version.' })
  async create(@Req() req: any, @Body() body: CreateFounderIntentDto) {
    return this.svc.createIntent(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('intents')
  @ApiOperation({ summary: 'List founder intents for the workspace' })
  @ApiOkResponse({ description: 'Paginated founder intents.' })
  async list(@Req() req: any, @Query() query: FounderIntentListQueryDto) {
    return this.svc.listIntents(req.user.workspaceId, query);
  }

  @Get('intents/:id')
  @ApiOperation({ summary: 'Get a founder intent by id' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getIntent(id, req.user.workspaceId);
  }

  @Put('intents/:id')
  @ApiOperation({ summary: 'Update a founder intent (auto-creates a new version)' })
  @ApiBody({ type: UpdateFounderIntentDto })
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateFounderIntentDto) {
    return this.svc.updateIntent(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Delete('intents/:id')
  @ApiOperation({ summary: 'Soft delete a founder intent' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.removeIntent(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  // Versioning -----------------------------------------------------------

  @Post('intents/:id/versions')
  @ApiOperation({ summary: 'Create an explicit version snapshot (major/minor/revision)' })
  @ApiBody({ type: VersionFounderIntentDto })
  async version(@Req() req: any, @Param('id') id: string, @Body() body: VersionFounderIntentDto) {
    return this.svc.versionIntent(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('intents/:id/versions')
  @ApiOperation({ summary: 'List all versions of an intent (active + historical)' })
  async listVersions(@Req() req: any, @Param('id') id: string) {
    return this.svc.listVersions(id, req.user.workspaceId);
  }

  @Get('intents/:id/versions/compare')
  @ApiOperation({ summary: 'Compare two versions of an intent and return a field diff' })
  async compareVersions(
    @Req() req: any,
    @Param('id') id: string,
    @Query() query: CompareVersionsQueryDto,
  ) {
    return this.svc.compareVersions(id, req.user.workspaceId, query);
  }

  // Lifecycle ------------------------------------------------------------

  @Post('intents/:id/transition')
  @ApiOperation({ summary: 'Transition an intent through its validated lifecycle states' })
  @ApiBody({ type: TransitionLifecycleDto })
  async transition(@Req() req: any, @Param('id') id: string, @Body() body: TransitionLifecycleDto) {
    return this.svc.transitionLifecycle(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Post('intents/:id/approve')
  @ApiOperation({ summary: 'Approve a reviewed intent (records an APPROVED review)' })
  @ApiBody({ type: ApproveIntentDto })
  async approve(@Req() req: any, @Param('id') id: string, @Body() body: ApproveIntentDto) {
    return this.svc.approveIntent(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  // Relationship graph ---------------------------------------------------

  @Post('intents/:id/relationships')
  @ApiOperation({ summary: 'Create a relationship edge from this intent to another' })
  @ApiBody({ type: CreateRelationshipDto })
  async createRelationship(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateRelationshipDto,
  ) {
    return this.svc.createRelationship(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get('graph')
  @ApiOperation({ summary: 'Get the founder intent relationship graph (nodes, edges, cycles)' })
  async graph(@Req() req: any) {
    return this.svc.getRelationshipGraph(req.user.workspaceId);
  }

  // Constitutional review ------------------------------------------------

  @Post('intents/:id/reviews')
  @ApiOperation({ summary: 'Record a constitutional review for an intent' })
  @ApiBody({ type: CreateReviewDto })
  async review(@Req() req: any, @Param('id') id: string, @Body() body: CreateReviewDto) {
    return this.svc.createReview(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('intents/:id/reviews')
  @ApiOperation({ summary: 'List the constitutional review history of an intent' })
  async listReviews(@Req() req: any, @Param('id') id: string) {
    return this.svc.listReviews(id, req.user.workspaceId);
  }

  // Founder override -----------------------------------------------------

  @Post('intents/:id/override')
  @ApiOperation({
    summary: 'Apply a founder override (priority/ownership/dependency/status/routing)',
    description: 'Produces an immutable override event with reason, timestamp, and operator.',
  })
  @ApiBody({ type: OverrideIntentDto })
  async override(@Req() req: any, @Param('id') id: string, @Body() body: OverrideIntentDto) {
    return this.svc.overrideIntent(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('intents/:id/overrides')
  @ApiOperation({ summary: 'List immutable override events for an intent' })
  async listOverrides(@Req() req: any, @Param('id') id: string) {
    return this.svc.listOverrides(id, req.user.workspaceId);
  }

  // Conflict resolution engine -------------------------------------------

  @Post('intents/:id/conflicts/detect')
  @ApiOperation({
    summary: 'Detect constitutional conflicts for an intent (no automatic resolution)',
  })
  async detectConflicts(@Req() req: any, @Param('id') id: string) {
    return this.svc.detectConflicts(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Get('conflicts')
  @ApiOperation({ summary: 'List detected conflicts for the workspace' })
  async listConflicts(@Req() req: any, @Query() query: ConflictListQueryDto) {
    return this.svc.listConflicts(req.user.workspaceId, query);
  }

  @Post('conflicts/:conflictId/resolve')
  @ApiOperation({
    summary: 'Record a founder decision on a conflict (acknowledge/resolve/dismiss)',
  })
  @ApiBody({ type: ResolveConflictDto })
  async resolveConflict(
    @Req() req: any,
    @Param('conflictId') conflictId: string,
    @Body() body: ResolveConflictDto,
  ) {
    return this.svc.resolveConflict(
      conflictId,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  // History --------------------------------------------------------------

  @Get('intents/:id/history')
  @ApiOperation({ summary: 'Get the full governance timeline for an intent' })
  async history(@Req() req: any, @Param('id') id: string) {
    return this.svc.getHistory(id, req.user.workspaceId);
  }
}
