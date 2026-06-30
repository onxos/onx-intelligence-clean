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
import { IntelligenceCapitalService } from './intelligence-capital.service';
import {
  AccumulateCapitalDto,
  CreateIntelligenceCapitalDto,
  ExecuteAllocationDto,
  IntelligenceCapitalListQueryDto,
  RollbackAllocationDto,
  TransitionCapitalStatusDto,
  UpdateIntelligenceCapitalDto,
} from './dto/intelligence-capital.dto';

@ApiTags('Intelligence Capital')
@Controller('intelligence-capital')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IntelligenceCapitalController {
  constructor(private readonly svc: IntelligenceCapitalService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Capital CRUD ---------------------------------------------------------

  @Post()
  @ApiOperation({ summary: 'Create a canonical intelligence capital entity (D13)' })
  @ApiBody({ type: CreateIntelligenceCapitalDto })
  @ApiOkResponse({ description: 'The created intelligence capital.' })
  async create(@Req() req: any, @Body() body: CreateIntelligenceCapitalDto) {
    return this.svc.createCapital(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get()
  @ApiOperation({ summary: 'List intelligence capital for the workspace' })
  async list(@Req() req: any, @Query() query: IntelligenceCapitalListQueryDto) {
    return this.svc.listCapital(req.user.workspaceId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an intelligence capital entity with recent events and allocations',
  })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getCapital(id, req.user.workspaceId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an intelligence capital entity' })
  @ApiBody({ type: UpdateIntelligenceCapitalDto })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateIntelligenceCapitalDto,
  ) {
    return this.svc.updateCapital(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete (archive) an intelligence capital entity' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.removeCapital(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Transition an intelligence capital through its lifecycle status' })
  @ApiBody({ type: TransitionCapitalStatusDto })
  async transition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: TransitionCapitalStatusDto,
  ) {
    return this.svc.transitionStatus(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  // Accumulation engine --------------------------------------------------

  @Post(':id/accumulate')
  @ApiOperation({
    summary:
      'Apply a capital accumulation operation (growth, compounding, decay, preservation, ...)',
  })
  @ApiBody({ type: AccumulateCapitalDto })
  async accumulate(@Req() req: any, @Param('id') id: string, @Body() body: AccumulateCapitalDto) {
    return this.svc.accumulate(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get(':id/accumulation-events')
  @ApiOperation({ summary: 'List the immutable accumulation event history for a capital entity' })
  async events(@Req() req: any, @Param('id') id: string) {
    return this.svc.listAccumulationEvents(id, req.user.workspaceId);
  }

  // Allocation execution / rollback -------------------------------------

  @Post('allocations/:id/execute')
  @ApiOperation({
    summary: 'Execute an approved allocation against capital (rules-engine governed, D13.5)',
  })
  @ApiBody({ type: ExecuteAllocationDto })
  async execute(@Req() req: any, @Param('id') id: string, @Body() body: ExecuteAllocationDto) {
    return this.svc.executeAllocation(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }

  @Post('allocations/:id/rollback')
  @ApiOperation({ summary: 'Roll back an executed allocation and restore drawn capital' })
  @ApiBody({ type: RollbackAllocationDto })
  async rollback(@Req() req: any, @Param('id') id: string, @Body() body: RollbackAllocationDto) {
    return this.svc.rollbackAllocation(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
  }
}
