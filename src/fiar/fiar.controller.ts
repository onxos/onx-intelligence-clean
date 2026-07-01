import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  AssignOwnershipDto,
  ClassifyAssetDto,
  CreateCategoryDto,
  CreatePolicyDto,
  CreateRelationshipDto,
  LifecycleTransitionDto,
  ListAssetsQueryDto,
  OverrideDto,
  RegisterAssetDto,
  StreamQueryDto,
  UpdateAssetDto,
} from './dto/fiar.dto';
import { FiarService } from './fiar.service';

@ApiTags('FIAR — Frontier Intelligence Asset Registry')
@Controller('fiar')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FiarController {
  constructor(private readonly svc: FiarService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'Frontier intelligence asset registry dashboard' })
  @ApiOkResponse({ description: 'Aggregate asset, class, relationship and policy posture.' })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  // Categories (Part B) ----------------------------------------------------

  @Post('categories')
  @ApiOperation({ summary: 'Create an asset category (Part B)' })
  @ApiBody({ type: CreateCategoryDto })
  @ApiOkResponse({ description: 'The created category.' })
  async createCategory(@Req() req: any, @Body() body: CreateCategoryDto) {
    return this.svc.createCategory(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('categories')
  @ApiOperation({ summary: 'List asset categories (Part B)' })
  @ApiOkResponse({ description: 'Recent asset categories.' })
  async listCategories(@Req() req: any, @Query() query: StreamQueryDto) {
    return this.svc.listCategories(req.user.workspaceId, query);
  }

  // Governance policy (Part F) --------------------------------------------

  @Post('policies')
  @ApiOperation({ summary: 'Create an asset governance policy (Part F)' })
  @ApiBody({ type: CreatePolicyDto })
  @ApiOkResponse({ description: 'The created policy.' })
  async createPolicy(@Req() req: any, @Body() body: CreatePolicyDto) {
    return this.svc.createPolicy(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  // Asset registration + lifecycle (Part A / C / D) -----------------------

  @Post('assets')
  @ApiOperation({ summary: 'Register a strategic intelligence asset (Part A/C)' })
  @ApiBody({ type: RegisterAssetDto })
  @ApiOkResponse({ description: 'The registered asset.' })
  async registerAsset(@Req() req: any, @Body() body: RegisterAssetDto) {
    return this.svc.registerAsset(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('assets')
  @ApiOperation({ summary: 'List registered assets for the workspace' })
  @ApiOkResponse({ description: 'A page of registered assets.' })
  async listAssets(@Req() req: any, @Query() query: ListAssetsQueryDto) {
    return this.svc.listAssets(req.user.workspaceId, query);
  }

  @Get('assets/:assetId')
  @ApiOperation({
    summary: 'Get an asset with its active classification, ownership and relationships',
  })
  @ApiOkResponse({ description: 'The asset detail.' })
  async getAsset(@Req() req: any, @Param('assetId') assetId: string) {
    return this.svc.getAsset(req.user.workspaceId, assetId);
  }

  @Patch('assets/:assetId')
  @ApiOperation({ summary: 'Update an asset (Part C)' })
  @ApiBody({ type: UpdateAssetDto })
  @ApiOkResponse({ description: 'The updated asset.' })
  async updateAsset(
    @Req() req: any,
    @Param('assetId') assetId: string,
    @Body() body: UpdateAssetDto,
  ) {
    return this.svc.updateAsset(
      req.user.workspaceId,
      req.user.userId,
      assetId,
      body,
      this.ctx(req),
    );
  }

  @Post('assets/:assetId/classify')
  @ApiOperation({ summary: 'Classify or reclassify an asset (Part B/C)' })
  @ApiBody({ type: ClassifyAssetDto })
  @ApiOkResponse({ description: 'The new active classification.' })
  async classifyAsset(
    @Req() req: any,
    @Param('assetId') assetId: string,
    @Body() body: ClassifyAssetDto,
  ) {
    return this.svc.classifyAsset(
      req.user.workspaceId,
      req.user.userId,
      assetId,
      body,
      this.ctx(req),
    );
  }

  @Post('assets/:assetId/ownership')
  @ApiOperation({ summary: 'Assign ownership of an asset (Part C)' })
  @ApiBody({ type: AssignOwnershipDto })
  @ApiOkResponse({ description: 'The new active ownership.' })
  async assignOwnership(
    @Req() req: any,
    @Param('assetId') assetId: string,
    @Body() body: AssignOwnershipDto,
  ) {
    return this.svc.assignOwnership(
      req.user.workspaceId,
      req.user.userId,
      assetId,
      body,
      this.ctx(req),
    );
  }

  @Post('assets/:assetId/relationships')
  @ApiOperation({ summary: 'Create a dependency-graph relationship (Part C)' })
  @ApiBody({ type: CreateRelationshipDto })
  @ApiOkResponse({ description: 'The created relationship.' })
  async createRelationship(
    @Req() req: any,
    @Param('assetId') assetId: string,
    @Body() body: CreateRelationshipDto,
  ) {
    return this.svc.createRelationship(
      req.user.workspaceId,
      req.user.userId,
      assetId,
      body,
      this.ctx(req),
    );
  }

  @Get('assets/:assetId/relationships')
  @ApiOperation({ summary: 'Get the outgoing dependency graph for an asset (Part C)' })
  @ApiOkResponse({ description: 'The dependency graph (nodes + edges).' })
  async getRelationshipGraph(@Req() req: any, @Param('assetId') assetId: string) {
    return this.svc.getRelationshipGraph(req.user.workspaceId, assetId);
  }

  @Get('assets/:assetId/lineage')
  @ApiOperation({ summary: 'Get the derivation/replacement lineage for an asset (Part C)' })
  @ApiOkResponse({ description: 'The asset lineage.' })
  async getLineage(@Req() req: any, @Param('assetId') assetId: string) {
    return this.svc.getLineage(req.user.workspaceId, assetId);
  }

  @Post('assets/:assetId/lifecycle')
  @ApiOperation({ summary: 'Transition an asset through its lifecycle (Part D)' })
  @ApiBody({ type: LifecycleTransitionDto })
  @ApiOkResponse({ description: 'The transitioned asset.' })
  async transitionLifecycle(
    @Req() req: any,
    @Param('assetId') assetId: string,
    @Body() body: LifecycleTransitionDto,
  ) {
    return this.svc.transitionLifecycle(
      req.user.workspaceId,
      req.user.userId,
      assetId,
      body,
      this.ctx(req),
    );
  }

  @Get('assets/:assetId/validate')
  @ApiOperation({ summary: 'Validate an asset against governance policy (Part F)' })
  @ApiOkResponse({ description: 'The governance validation result.' })
  async validateAsset(@Req() req: any, @Param('assetId') assetId: string) {
    return this.svc.validateAsset(req.user.workspaceId, assetId);
  }

  @Get('assets/:assetId/history')
  @ApiOperation({ summary: 'Get the immutable history for an asset (Part F)' })
  @ApiOkResponse({ description: 'Recent asset history events.' })
  async getHistory(
    @Req() req: any,
    @Param('assetId') assetId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listHistory(req.user.workspaceId, assetId, query);
  }

  @Get('assets/:assetId/evidence')
  @ApiOperation({ summary: 'Get evidence for an asset (Part F)' })
  @ApiOkResponse({ description: 'Recent asset evidence records.' })
  async getEvidence(
    @Req() req: any,
    @Param('assetId') assetId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listEvidence(req.user.workspaceId, assetId, query);
  }

  @Post('assets/:assetId/override')
  @ApiOperation({ summary: 'Apply an immutable founder override to an asset (Part F)' })
  @ApiBody({ type: OverrideDto })
  @ApiOkResponse({ description: 'The overridden asset.' })
  async override(@Req() req: any, @Param('assetId') assetId: string, @Body() body: OverrideDto) {
    return this.svc.override(req.user.workspaceId, req.user.userId, assetId, body, this.ctx(req));
  }
}
