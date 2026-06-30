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
  AddUnderstandingEvidenceDto,
  CreateIUCDto,
  CreateUnderstandingRelationshipDto,
  EvolveUnderstandingDto,
  IUCListQueryDto,
  TransitionUnderstandingStateDto,
  UpdateConfidenceDto,
  UpdateIUCDto,
  UpdateProgressDto,
} from './dto/iuc.dto';
import { IUCService } from './iuc.service';

@ApiTags('Intelligence Understanding Capital')
@Controller('iuc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IUCController {
  constructor(private readonly svc: IUCService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // IUC CRUD -------------------------------------------------------------

  @Post()
  @ApiOperation({ summary: 'Create an Intelligence Understanding Capital entity (NASCENT)' })
  @ApiBody({ type: CreateIUCDto })
  @ApiOkResponse({ description: 'The created IUC entity.' })
  async create(@Req() req: any, @Body() body: CreateIUCDto) {
    return this.svc.createIuc(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get()
  @ApiOperation({ summary: 'List IUC entities for the workspace' })
  async list(@Req() req: any, @Query() query: IUCListQueryDto) {
    return this.svc.listIuc(req.user.workspaceId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an IUC entity with events, evidence and relationships' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getIuc(id, req.user.workspaceId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an IUC entity' })
  @ApiBody({ type: UpdateIUCDto })
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateIUCDto) {
    return this.svc.updateIuc(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete (archive) an IUC entity' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.removeIuc(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  // State / progress / confidence / evolution ----------------------------

  @Post(':id/state')
  @ApiOperation({ summary: 'Transition the understanding through its validated state machine' })
  @ApiBody({ type: TransitionUnderstandingStateDto })
  async transition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: TransitionUnderstandingStateDto,
  ) {
    return this.svc.transitionState(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post(':id/progress')
  @ApiOperation({ summary: 'Update understanding progress (records a progress event)' })
  @ApiBody({ type: UpdateProgressDto })
  async progress(@Req() req: any, @Param('id') id: string, @Body() body: UpdateProgressDto) {
    return this.svc.updateProgress(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post(':id/confidence')
  @ApiOperation({ summary: 'Update understanding confidence (records a confidence event)' })
  @ApiBody({ type: UpdateConfidenceDto })
  async confidence(@Req() req: any, @Param('id') id: string, @Body() body: UpdateConfidenceDto) {
    return this.svc.updateConfidence(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Post(':id/evolve')
  @ApiOperation({
    summary: 'Evolve the understanding (moves to EVOLVING and records the evolution)',
  })
  @ApiBody({ type: EvolveUnderstandingDto })
  async evolve(@Req() req: any, @Param('id') id: string, @Body() body: EvolveUnderstandingDto) {
    return this.svc.evolve(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  // Evidence + relationships --------------------------------------------

  @Post(':id/evidence')
  @ApiOperation({ summary: 'Attach supporting evidence to the understanding' })
  @ApiBody({ type: AddUnderstandingEvidenceDto })
  async addEvidence(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AddUnderstandingEvidenceDto,
  ) {
    return this.svc.addEvidence(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post(':id/relationships')
  @ApiOperation({ summary: 'Create a typed relationship edge to another understanding' })
  @ApiBody({ type: CreateUnderstandingRelationshipDto })
  async relate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateUnderstandingRelationshipDto,
  ) {
    return this.svc.createRelationship(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'List the immutable understanding event timeline' })
  async events(@Req() req: any, @Param('id') id: string) {
    return this.svc.listEvents(id, req.user.workspaceId);
  }
}
