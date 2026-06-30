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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { IntelligenceLearningService } from './intelligence-learning.service';
import {
  CapitalizeLearningDto,
  CreateLearningDto,
  LearningListQueryDto,
  LearningTransitionDto,
  PatternListQueryDto,
  RecordEvolutionDto,
  RegisterPatternDto,
  ReinforceLearningDto,
  UpdateLearningDto,
} from './dto/intelligence-learning.dto';

@ApiTags('Intelligence Learning')
@Controller('intelligence-learning')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IntelligenceLearningController {
  constructor(private readonly svc: IntelligenceLearningService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Learning States -------------------------------------------------------

  @Post('learnings')
  @ApiOperation({ summary: 'Create a learning unit (state OBSERVED)' })
  @ApiBody({ type: CreateLearningDto })
  async create(@Req() req: any, @Body() body: CreateLearningDto) {
    return this.svc.createLearning(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('learnings')
  @ApiOperation({ summary: 'List learning units' })
  async list(@Req() req: any, @Query() query: LearningListQueryDto) {
    return this.svc.listLearnings(req.user.workspaceId, query);
  }

  @Get('learnings/:id')
  @ApiOperation({ summary: 'Get a learning unit' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getLearning(id, req.user.workspaceId);
  }

  @Put('learnings/:id')
  @ApiOperation({ summary: 'Update a learning unit' })
  @ApiBody({ type: UpdateLearningDto })
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateLearningDto) {
    return this.svc.updateLearning(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Delete('learnings/:id')
  @ApiOperation({ summary: 'Soft delete a learning unit' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.removeLearning(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Post('learnings/:id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted learning unit' })
  async restore(@Req() req: any, @Param('id') id: string) {
    return this.svc.restoreLearning(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Post('learnings/:id/transition')
  @ApiOperation({ summary: 'Transition a learning unit through its lifecycle states' })
  @ApiBody({ type: LearningTransitionDto })
  async transition(@Req() req: any, @Param('id') id: string, @Body() body: LearningTransitionDto) {
    return this.svc.transitionLearning(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get('learnings/:id/events')
  @ApiOperation({ summary: 'List learning events for a unit' })
  async events(@Req() req: any, @Param('id') id: string) {
    return this.svc.listLearningEvents(id, req.user.workspaceId);
  }

  @Post('learnings/:id/reinforce')
  @ApiOperation({ summary: 'Reinforce a learning unit' })
  @ApiBody({ type: ReinforceLearningDto })
  async reinforce(@Req() req: any, @Param('id') id: string, @Body() body: ReinforceLearningDto) {
    return this.svc.reinforceLearning(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Post('learnings/:id/contradict')
  @ApiOperation({ summary: 'Record a contradiction against a learning unit' })
  @ApiBody({ type: ReinforceLearningDto })
  async contradict(@Req() req: any, @Param('id') id: string, @Body() body: ReinforceLearningDto) {
    return this.svc.contradictLearning(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  // Knowledge Evolution ---------------------------------------------------

  @Post('learnings/:id/evolution')
  @ApiOperation({ summary: 'Record a knowledge evolution event for a learning unit' })
  @ApiBody({ type: RecordEvolutionDto })
  async recordEvolution(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: RecordEvolutionDto,
  ) {
    return this.svc.recordEvolution(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('learnings/:id/evolution')
  @ApiOperation({ summary: 'List the evolution history of a learning unit' })
  async listEvolution(@Req() req: any, @Param('id') id: string) {
    return this.svc.listEvolution(id, req.user.workspaceId);
  }

  // Capitalization --------------------------------------------------------

  @Post('learnings/:id/capitalize')
  @ApiOperation({ summary: 'Evaluate / trigger a capitalization event for a learning unit' })
  @ApiBody({ type: CapitalizeLearningDto })
  async capitalize(@Req() req: any, @Param('id') id: string, @Body() body: CapitalizeLearningDto) {
    return this.svc.capitalizeLearning(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get('learnings/:id/capitalization')
  @ApiOperation({ summary: 'List capitalization events for a learning unit' })
  async listCapitalization(@Req() req: any, @Param('id') id: string) {
    return this.svc.listCapitalizationEvents(id, req.user.workspaceId);
  }

  // Pattern Engine --------------------------------------------------------

  @Post('patterns')
  @ApiOperation({ summary: 'Register a discovered pattern' })
  @ApiBody({ type: RegisterPatternDto })
  async registerPattern(@Req() req: any, @Body() body: RegisterPatternDto) {
    return this.svc.registerPattern(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('patterns/discover')
  @ApiOperation({ summary: 'Run deterministic pattern discovery across learning units' })
  async discoverPatterns(@Req() req: any) {
    return this.svc.discoverPatterns(req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Get('patterns')
  @ApiOperation({ summary: 'List patterns' })
  async listPatterns(@Req() req: any, @Query() query: PatternListQueryDto) {
    return this.svc.listPatterns(req.user.workspaceId, query);
  }

  @Get('patterns/:id')
  @ApiOperation({ summary: 'Get a pattern' })
  async getPattern(@Req() req: any, @Param('id') id: string) {
    return this.svc.getPattern(id, req.user.workspaceId);
  }
}
