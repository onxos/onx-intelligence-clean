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
  AddMeasurementEvidenceDto,
  CalculateMeasurementDto,
  CreateBenchmarkDto,
  CreateMeasurementProfileDto,
  MeasurementListQueryDto,
  RecordFailureDto,
  RecordFeedbackDto,
  TrendQueryDto,
  UpdateMeasurementProfileDto,
} from './dto/measurement.dto';
import { MeasurementService } from './measurement.service';

@ApiTags('Intelligence Measurement')
@Controller('measurement')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MeasurementController {
  constructor(private readonly svc: MeasurementService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Workspace-level reporting (literal routes MUST precede ':id') ----------

  @Get('dashboard')
  @ApiOperation({ summary: 'Composite measurement dashboard for the workspace' })
  @ApiOkResponse({ description: 'Aggregate measurement posture across all profiles.' })
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req.user.workspaceId);
  }

  @Get('failures')
  @ApiOperation({ summary: 'Failure dimension report across measurement profiles' })
  @ApiOkResponse({ description: 'Recorded measurement failures grouped by type.' })
  async failures(@Req() req: any) {
    return this.svc.failureReport(req.user.workspaceId);
  }

  // Profile CRUD ----------------------------------------------------------

  @Post()
  @ApiOperation({ summary: 'Create a measurement profile (index)' })
  @ApiBody({ type: CreateMeasurementProfileDto })
  @ApiOkResponse({ description: 'The created measurement profile.' })
  async create(@Req() req: any, @Body() body: CreateMeasurementProfileDto) {
    return this.svc.createProfile(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get()
  @ApiOperation({ summary: 'List measurement profiles for the workspace' })
  @ApiOkResponse({ description: 'A paginated list of measurement profiles.' })
  async list(@Req() req: any, @Query() query: MeasurementListQueryDto) {
    return this.svc.listProfiles(req.user.workspaceId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a measurement profile with records, history, evidence and benchmarks',
  })
  @ApiOkResponse({ description: 'The measurement profile and its related entities.' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getProfile(id, req.user.workspaceId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a measurement profile' })
  @ApiBody({ type: UpdateMeasurementProfileDto })
  @ApiOkResponse({ description: 'The updated measurement profile.' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateMeasurementProfileDto,
  ) {
    return this.svc.updateProfile(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete (archive) a measurement profile' })
  @ApiOkResponse({ description: 'The archived profile identity.' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.removeProfile(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  // Part B/C — Scoring + progress tracking --------------------------------

  @Post(':id/calculate')
  @ApiOperation({ summary: 'Calculate a new measurement score from weighted components' })
  @ApiBody({ type: CalculateMeasurementDto })
  @ApiOkResponse({ description: 'The updated profile and the new measurement record.' })
  async calculate(@Req() req: any, @Param('id') id: string, @Body() body: CalculateMeasurementDto) {
    return this.svc.calculate(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Measurement history event stream for a profile' })
  @ApiOkResponse({ description: 'Chronological measurement history events.' })
  async history(@Req() req: any, @Param('id') id: string, @Query() query: TrendQueryDto) {
    return this.svc.history(id, req.user.workspaceId, query);
  }

  @Get(':id/trend')
  @ApiOperation({ summary: 'Measurement trend and progress series for a profile' })
  @ApiOkResponse({ description: 'Trend classification, progress state and score series.' })
  async trend(@Req() req: any, @Param('id') id: string, @Query() query: TrendQueryDto) {
    return this.svc.trend(id, req.user.workspaceId, query);
  }

  // Benchmarks ------------------------------------------------------------

  @Post(':id/benchmarks')
  @ApiOperation({ summary: 'Set a benchmark for a measurement profile' })
  @ApiBody({ type: CreateBenchmarkDto })
  @ApiOkResponse({ description: 'The created benchmark and its comparison to the current score.' })
  async createBenchmark(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateBenchmarkDto,
  ) {
    return this.svc.createBenchmark(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get(':id/benchmarks')
  @ApiOperation({ summary: 'List benchmarks with current-score comparisons for a profile' })
  @ApiOkResponse({ description: 'Benchmarks and their comparisons.' })
  async listBenchmarks(@Req() req: any, @Param('id') id: string) {
    return this.svc.listBenchmarks(id, req.user.workspaceId);
  }

  // Evidence --------------------------------------------------------------

  @Post(':id/evidence')
  @ApiOperation({ summary: 'Attach evidence to a measurement profile' })
  @ApiBody({ type: AddMeasurementEvidenceDto })
  @ApiOkResponse({ description: 'The created measurement evidence link.' })
  async addEvidence(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AddMeasurementEvidenceDto,
  ) {
    return this.svc.addEvidence(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  // Part D — Feedback loops ----------------------------------------------

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Record a feedback signal against a measurement profile' })
  @ApiBody({ type: RecordFeedbackDto })
  @ApiOkResponse({ description: 'The recorded measurement feedback.' })
  async recordFeedback(@Req() req: any, @Param('id') id: string, @Body() body: RecordFeedbackDto) {
    return this.svc.recordFeedback(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  // Part E — Failure dimensions ------------------------------------------

  @Post(':id/failures')
  @ApiOperation({ summary: 'Record a measurement failure dimension for a profile' })
  @ApiBody({ type: RecordFailureDto })
  @ApiOkResponse({ description: 'The recorded measurement failure history event.' })
  async recordFailure(@Req() req: any, @Param('id') id: string, @Body() body: RecordFailureDto) {
    return this.svc.recordFailure(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }
}
