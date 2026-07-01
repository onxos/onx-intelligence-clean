import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  CreateBuildProfileDto,
  CreateDeploymentProfileDto,
  DeclareBoundaryDto,
  DeclareDependencyDto,
  ListProfilesQueryDto,
  ListUnitsQueryDto,
  OverrideUnitDto,
  RegisterPackageDto,
  RegisterUnitDto,
} from './dto/d20.dto';
import { D20Service } from './d20.service';

@ApiTags('D20 Implementation Boundary')
@Controller('d20')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class D20Controller {
  constructor(private readonly svc: D20Service) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':param' routes) ---

  @Get('dashboard')
  @ApiOperation({ summary: 'D20 implementation boundary dashboard' })
  @ApiOkResponse({ description: 'Registry, build and deployment posture.' })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  @Get('compatibility')
  @ApiOperation({ summary: 'Compatibility report across reused modules (Part C/D)' })
  @ApiOkResponse({ description: 'The compatibility matrix rollup.' })
  async compatibility(@Req() req: any) {
    return this.svc.compatibilityReport(req.user.workspaceId);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate the implementation registry, boundaries and dependencies' })
  @ApiOkResponse({ description: 'The aggregate implementation validation result.' })
  async validate(@Req() req: any) {
    return this.svc.validateImplementation(req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  // Part A — packages -------------------------------------------------------

  @Post('packages')
  @ApiOperation({ summary: 'Register an implementation package (Part A)' })
  @ApiBody({ type: RegisterPackageDto })
  @ApiOkResponse({ description: 'The created implementation package.' })
  async registerPackage(@Req() req: any, @Body() body: RegisterPackageDto) {
    return this.svc.registerPackage(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  // Part A — dependencies ---------------------------------------------------

  @Post('dependencies')
  @ApiOperation({ summary: 'Declare an implementation dependency (Part A/D)' })
  @ApiBody({ type: DeclareDependencyDto })
  @ApiOkResponse({ description: 'The created dependency (with cycle flag).' })
  async declareDependency(@Req() req: any, @Body() body: DeclareDependencyDto) {
    return this.svc.declareDependency(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('dependencies/graph')
  @ApiOperation({ summary: 'Get the dependency graph with cycle detection (Part B/D)' })
  @ApiOkResponse({ description: 'The dependency graph and validation.' })
  async dependencyGraph(@Req() req: any) {
    return this.svc.dependencyGraph(req.user.workspaceId);
  }

  // Part C — build profiles -------------------------------------------------

  @Post('builds')
  @ApiOperation({ summary: 'Create a build profile (Part C)' })
  @ApiBody({ type: CreateBuildProfileDto })
  @ApiOkResponse({ description: 'The created build profile with its evaluation.' })
  async createBuild(@Req() req: any, @Body() body: CreateBuildProfileDto) {
    return this.svc.createBuildProfile(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('builds')
  @ApiOperation({ summary: 'List build profiles' })
  @ApiOkResponse({ description: 'A page of build profiles.' })
  async listBuilds(@Req() req: any, @Query() query: ListProfilesQueryDto) {
    return this.svc.listBuilds(req.user.workspaceId, query);
  }

  @Post('builds/:buildId/validate')
  @ApiOperation({ summary: 'Validate a build profile (Part C/D)' })
  @ApiOkResponse({ description: 'The revalidated build profile.' })
  async validateBuild(@Req() req: any, @Param('buildId') buildId: string) {
    return this.svc.validateBuild(req.user.workspaceId, req.user.userId, buildId, this.ctx(req));
  }

  // Part E — deployment profiles --------------------------------------------

  @Post('deployments')
  @ApiOperation({ summary: 'Create a deployment profile (Part E)' })
  @ApiBody({ type: CreateDeploymentProfileDto })
  @ApiOkResponse({ description: 'The created deployment profile with its evaluation.' })
  async createDeployment(@Req() req: any, @Body() body: CreateDeploymentProfileDto) {
    return this.svc.createDeploymentProfile(
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get('deployments')
  @ApiOperation({ summary: 'List deployment profiles' })
  @ApiOkResponse({ description: 'A page of deployment profiles.' })
  async listDeployments(@Req() req: any, @Query() query: ListProfilesQueryDto) {
    return this.svc.listDeployments(req.user.workspaceId, query);
  }

  @Post('deployments/:deploymentId/validate')
  @ApiOperation({ summary: 'Validate a deployment profile (Part E)' })
  @ApiOkResponse({ description: 'The revalidated deployment profile.' })
  async validateDeployment(@Req() req: any, @Param('deploymentId') deploymentId: string) {
    return this.svc.validateDeployment(
      req.user.workspaceId,
      req.user.userId,
      deploymentId,
      this.ctx(req),
    );
  }

  // Part A — units ----------------------------------------------------------

  @Post('units')
  @ApiOperation({ summary: 'Register an implementation unit (Part A)' })
  @ApiBody({ type: RegisterUnitDto })
  @ApiOkResponse({ description: 'The created implementation unit.' })
  async registerUnit(@Req() req: any, @Body() body: RegisterUnitDto) {
    return this.svc.registerUnit(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('units')
  @ApiOperation({ summary: 'List implementation units' })
  @ApiOkResponse({ description: 'A page of implementation units.' })
  async listUnits(@Req() req: any, @Query() query: ListUnitsQueryDto) {
    return this.svc.listUnits(req.user.workspaceId, query);
  }

  @Get('units/:unitId')
  @ApiOperation({ summary: 'Get an implementation unit with boundaries and dependencies' })
  @ApiOkResponse({ description: 'The implementation unit detail.' })
  async getUnit(@Req() req: any, @Param('unitId') unitId: string) {
    return this.svc.getUnit(req.user.workspaceId, unitId);
  }

  @Post('units/:unitId/boundaries')
  @ApiOperation({ summary: 'Declare a boundary for an implementation unit (Part B)' })
  @ApiBody({ type: DeclareBoundaryDto })
  @ApiOkResponse({ description: 'The created boundary.' })
  async declareBoundary(
    @Req() req: any,
    @Param('unitId') unitId: string,
    @Body() body: DeclareBoundaryDto,
  ) {
    return this.svc.declareBoundary(
      req.user.workspaceId,
      req.user.userId,
      unitId,
      body,
      this.ctx(req),
    );
  }

  @Post('units/:unitId/override')
  @ApiOperation({ summary: 'Apply an immutable founder override to an implementation unit' })
  @ApiBody({ type: OverrideUnitDto })
  @ApiOkResponse({ description: 'The overridden implementation unit.' })
  async override(@Req() req: any, @Param('unitId') unitId: string, @Body() body: OverrideUnitDto) {
    return this.svc.override(req.user.workspaceId, req.user.userId, unitId, body, this.ctx(req));
  }
}
