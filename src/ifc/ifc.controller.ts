import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  CalculateScoreDto,
  CapitalizationSignalDto,
  CreateDimensionDto,
  CreatePolicyDto,
  CreateProfileDto,
  ListQueryDto,
  OverrideDto,
  RecordIndicatorDto,
  StreamQueryDto,
  UpdateDimensionDto,
  UpdateProfileDto,
} from './dto/ifc.dto';
import { IfcService } from './ifc.service';

@ApiTags('IFC — Institutional Flourishing Capital')
@Controller('ifc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IfcController {
  constructor(private readonly svc: IfcService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'Institutional flourishing capital dashboard' })
  @ApiOkResponse({ description: 'Aggregate profile, dimension, signal and score posture.' })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  // Governance policy (Part F) --------------------------------------------

  @Post('policies')
  @ApiOperation({ summary: 'Create an IFC governance policy (Part F)' })
  @ApiBody({ type: CreatePolicyDto })
  @ApiOkResponse({ description: 'The created policy.' })
  async createPolicy(@Req() req: any, @Body() body: CreatePolicyDto) {
    return this.svc.createPolicy(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  // Dimension update (distinct segment) -----------------------------------

  @Patch('dimensions/:dimensionId')
  @ApiOperation({ summary: 'Update a flourishing dimension (Part B)' })
  @ApiBody({ type: UpdateDimensionDto })
  @ApiOkResponse({ description: 'The updated dimension.' })
  async updateDimension(
    @Req() req: any,
    @Param('dimensionId') dimensionId: string,
    @Body() body: UpdateDimensionDto,
  ) {
    return this.svc.updateDimension(
      req.user.workspaceId,
      req.user.userId,
      dimensionId,
      body,
      this.ctx(req),
    );
  }

  // Profile lifecycle (Part A) --------------------------------------------

  @Post('profiles')
  @ApiOperation({ summary: 'Create an IFC profile and seed flourishing dimensions (Part A/B)' })
  @ApiBody({ type: CreateProfileDto })
  @ApiOkResponse({ description: 'The created profile.' })
  async createProfile(@Req() req: any, @Body() body: CreateProfileDto) {
    return this.svc.createProfile(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('profiles')
  @ApiOperation({ summary: 'List IFC profiles for the workspace' })
  @ApiOkResponse({ description: 'A page of IFC profiles.' })
  async listProfiles(@Req() req: any, @Query() query: ListQueryDto) {
    return this.svc.listProfiles(req.user.workspaceId, query);
  }

  @Get('profiles/:profileId')
  @ApiOperation({ summary: 'Get a profile with dimensions and its latest score' })
  @ApiOkResponse({ description: 'The profile detail.' })
  async getProfile(@Req() req: any, @Param('profileId') profileId: string) {
    return this.svc.getProfile(req.user.workspaceId, profileId);
  }

  @Patch('profiles/:profileId')
  @ApiOperation({ summary: 'Update an IFC profile (Part A)' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ description: 'The updated profile.' })
  async updateProfile(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Body() body: UpdateProfileDto,
  ) {
    return this.svc.updateProfile(
      req.user.workspaceId,
      req.user.userId,
      profileId,
      body,
      this.ctx(req),
    );
  }

  @Get('profiles/:profileId/validate')
  @ApiOperation({ summary: 'Validate a profile against governance policy (Part F)' })
  @ApiOkResponse({ description: 'The governance validation result.' })
  async validateProfile(@Req() req: any, @Param('profileId') profileId: string) {
    return this.svc.validateProfile(req.user.workspaceId, profileId);
  }

  // Dimensions + indicators (Part B) --------------------------------------

  @Post('profiles/:profileId/dimensions')
  @ApiOperation({ summary: 'Add a flourishing dimension to a profile (Part B)' })
  @ApiBody({ type: CreateDimensionDto })
  @ApiOkResponse({ description: 'The created dimension.' })
  async createDimension(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Body() body: CreateDimensionDto,
  ) {
    return this.svc.createDimension(
      req.user.workspaceId,
      req.user.userId,
      profileId,
      body,
      this.ctx(req),
    );
  }

  @Post('profiles/:profileId/indicators')
  @ApiOperation({ summary: 'Record a dimension indicator and roll up the dimension (Part B)' })
  @ApiBody({ type: RecordIndicatorDto })
  @ApiOkResponse({ description: 'The recorded indicator.' })
  async recordIndicator(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Body() body: RecordIndicatorDto,
  ) {
    return this.svc.recordIndicator(
      req.user.workspaceId,
      req.user.userId,
      profileId,
      body,
      this.ctx(req),
    );
  }

  // Scoring (Part C) ------------------------------------------------------

  @Post('profiles/:profileId/score')
  @ApiOperation({ summary: 'Calculate the flourishing index for a profile (Part C)' })
  @ApiBody({ type: CalculateScoreDto })
  @ApiOkResponse({ description: 'The score record and computed flourishing result.' })
  async calculateScore(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Body() body: CalculateScoreDto,
  ) {
    return this.svc.calculateScore(
      req.user.workspaceId,
      req.user.userId,
      profileId,
      body,
      this.ctx(req),
    );
  }

  @Get('profiles/:profileId/scores')
  @ApiOperation({ summary: 'List score history for a profile (Part C)' })
  @ApiOkResponse({ description: 'Recent flourishing scores.' })
  async listScores(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listScores(req.user.workspaceId, profileId, query);
  }

  // Capitalization (Part D) -----------------------------------------------

  @Post('profiles/:profileId/capitalization')
  @ApiOperation({ summary: 'Emit a capitalization signal for Intelligence Capital (Part D)' })
  @ApiBody({ type: CapitalizationSignalDto })
  @ApiOkResponse({ description: 'The capitalization signal and allocation recommendation.' })
  async capitalizationSignal(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Body() body: CapitalizationSignalDto,
  ) {
    return this.svc.capitalizationSignal(
      req.user.workspaceId,
      req.user.userId,
      profileId,
      body,
      this.ctx(req),
    );
  }

  // Founder alignment (Part E) --------------------------------------------

  @Post('profiles/:profileId/alignment')
  @ApiOperation({ summary: 'Check founder alignment for a profile (Part E)' })
  @ApiOkResponse({ description: 'The founder alignment result.' })
  async alignmentCheck(@Req() req: any, @Param('profileId') profileId: string) {
    return this.svc.alignmentCheck(req.user.workspaceId, req.user.userId, profileId, this.ctx(req));
  }

  // History + evidence (Part F) -------------------------------------------

  @Get('profiles/:profileId/history')
  @ApiOperation({ summary: 'Get immutable flourishing history for a profile (Part F)' })
  @ApiOkResponse({ description: 'Recent flourishing history events.' })
  async getHistory(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listHistory(req.user.workspaceId, profileId, query);
  }

  @Get('profiles/:profileId/evidence')
  @ApiOperation({ summary: 'Get flourishing evidence for a profile (Part F)' })
  @ApiOkResponse({ description: 'Recent flourishing evidence records.' })
  async getEvidence(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Query() query: StreamQueryDto,
  ) {
    return this.svc.listEvidence(req.user.workspaceId, profileId, query);
  }

  @Post('profiles/:profileId/override')
  @ApiOperation({ summary: 'Apply an immutable founder override to a profile (Part F)' })
  @ApiBody({ type: OverrideDto })
  @ApiOkResponse({ description: 'The overridden profile.' })
  async override(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Body() body: OverrideDto,
  ) {
    return this.svc.override(req.user.workspaceId, req.user.userId, profileId, body, this.ctx(req));
  }
}
