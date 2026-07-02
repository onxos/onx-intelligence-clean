import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { DECISION_LADDER_STEPS } from './decision-ladder.constants';
import { DecisionLadderService } from './decision-ladder.service';
import { ApproveGateDto, DecisionRunListQueryDto, StartLadderDto } from './dto/decision-ladder.dto';

@ApiTags('Decision Ladder (D14)')
@Controller('decision')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DecisionLadderController {
  constructor(private readonly svc: DecisionLadderService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  /** 202 ACCEPTED when a run pauses for a human gate, otherwise the default code. */
  private gateAware(res: Response, run: { humanGateRequired?: boolean }) {
    if (run?.humanGateRequired) {
      res.status(HttpStatus.ACCEPTED);
    }
  }

  @Get('ladder/steps')
  @ApiOperation({ summary: 'The 14-step decision ladder definition (D1-D14, 5 stages)' })
  @ApiOkResponse({ description: 'Ladder step definitions.' })
  async steps() {
    return { total: DECISION_LADDER_STEPS.length, steps: DECISION_LADDER_STEPS };
  }

  @Get('ladder/stats')
  @ApiOperation({ summary: 'Decision run statistics by stage and status' })
  @ApiOkResponse({ description: 'Ladder statistics.' })
  async stats(@Req() req: any) {
    return this.svc.stats(req.user.workspaceId);
  }

  @Post('ladder/start')
  @ApiOperation({ summary: 'Start a decision run from a perception record (auto-runs D1-D9)' })
  @ApiBody({ type: StartLadderDto })
  @ApiOkResponse({ description: 'The decision run (202 if it pauses at a human gate).' })
  async start(
    @Req() req: any,
    @Body() body: StartLadderDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const run = await this.svc.start(req.user.workspaceId, req.user.userId, body, this.ctx(req));
    this.gateAware(res, run);
    return run;
  }

  @Get('runs')
  @ApiOperation({ summary: 'List decision runs' })
  @ApiOkResponse({ description: 'Paginated decision runs.' })
  async listRuns(@Req() req: any, @Query() query: DecisionRunListQueryDto) {
    return this.svc.listRuns(req.user.workspaceId, query);
  }

  @Get('pending-gates')
  @ApiOperation({ summary: 'List decision runs paused awaiting human approval' })
  @ApiOkResponse({ description: 'Paginated pending-gate runs.' })
  async pendingGates(@Req() req: any, @Query() query: DecisionRunListQueryDto) {
    return this.svc.pendingGates(req.user.workspaceId, query);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get a decision run with its step history' })
  @ApiOkResponse({ description: 'The decision run.' })
  async getRun(@Req() req: any, @Param('id') id: string) {
    return this.svc.getRun(id, req.user.workspaceId);
  }

  @Post('runs/:id/step')
  @ApiOperation({ summary: 'Advance the decision run one step (D9 -> D14)' })
  @ApiOkResponse({ description: 'The advanced run (202 if it pauses at a human gate).' })
  async step(@Req() req: any, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const run = await this.svc.advance(id, req.user.workspaceId, req.user.userId, this.ctx(req));
    this.gateAware(res, run);
    return run;
  }

  @Post('runs/:id/approve')
  @ApiOperation({ summary: 'Human approves a gate (DG resolution / DG-10 institutionalization)' })
  @ApiBody({ type: ApproveGateDto })
  @ApiOkResponse({ description: 'The run after the gate is resolved.' })
  async approve(@Req() req: any, @Param('id') id: string, @Body() body: ApproveGateDto) {
    return this.svc.approve(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('runs/:id/abandon')
  @ApiOperation({ summary: 'Abandon a decision run' })
  @ApiOkResponse({ description: 'The abandoned run.' })
  async abandon(@Req() req: any, @Param('id') id: string) {
    return this.svc.abandon(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }
}
