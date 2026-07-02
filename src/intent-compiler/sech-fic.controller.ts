import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { ThrottlerGuard } from '../security/throttler.guard';
import { Throttle } from '../security/throttle.decorator';
import { THROTTLER_CONFIG } from '../security/throttler.config';
import { FicCheckListQueryDto, FicCheckRequestDto } from './dto/fic-enforcement.dto';
import { FicEnforcementService } from './fic-enforcement.service';

@ApiTags('SECH-FIC Runtime Enforcement')
@Controller('sech')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle(THROTTLER_CONFIG.fic)
@ApiBearerAuth()
export class SechFicController {
  constructor(private readonly svc: FicEnforcementService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Runtime enforcement -------------------------------------------------

  @Post('fic-check')
  @ApiOperation({
    summary: 'Run the 13-step SECH-FIC runtime enforcement check against a proposed decision',
  })
  @ApiBody({ type: FicCheckRequestDto })
  @ApiOkResponse({
    description:
      'Enforcement result: APPROVED (continue), REJECTED (stop + counter-proposal), CONFLICT (escalate), or OVERRIDE (emergency protocol).',
  })
  async ficCheck(@Req() req: any, @Body() body: FicCheckRequestDto) {
    return this.svc.runCheck(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('checks')
  @ApiOperation({ summary: 'List persisted enforcement checks for the workspace' })
  @ApiOkResponse({ description: 'Paginated enforcement checks.' })
  async listChecks(@Req() req: any, @Query() query: FicCheckListQueryDto) {
    return this.svc.listChecks(req.user.workspaceId, query);
  }

  @Get('checks/:id')
  @ApiOperation({ summary: 'Get a single enforcement check with evaluations + violations' })
  @ApiOkResponse({ description: 'The enforcement check.' })
  async getCheck(@Req() req: any, @Param('id') id: string) {
    return this.svc.getCheck(id, req.user.workspaceId);
  }

  // Constitutional registry (read-only) --------------------------------

  @Get('registry')
  @ApiOperation({ summary: 'Summary counts of the constitutional constraint registry' })
  @ApiOkResponse({ description: 'Registry summary.' })
  async registry() {
    return this.svc.getRegistrySummary();
  }

  @Get('constraints')
  @ApiOperation({ summary: 'List executable constraints (optionally filter by kind)' })
  @ApiOkResponse({ description: 'Constraints (68 total across HC/SC/AC/DG/EB/OVR/OR).' })
  async listConstraints(@Query('kind') kind?: string) {
    return this.svc.listConstraints(kind);
  }

  @Get('constraints/:id')
  @ApiOperation({ summary: 'Get a single constraint by id (e.g. HC-08, EB-03)' })
  @ApiOkResponse({ description: 'The constraint definition.' })
  async getConstraint(@Param('id') id: string) {
    return this.svc.getConstraint(id);
  }

  @Get('intents')
  @ApiOperation({ summary: 'List the 38 canonical Founder Intent corpus objects' })
  @ApiOkResponse({ description: 'Founder Intent corpus.' })
  async listIntents() {
    return this.svc.listIntents();
  }

  @Get('conflict-classes')
  @ApiOperation({ summary: 'List the 7 conflict resolution classes' })
  @ApiOkResponse({ description: 'Conflict resolution classes.' })
  async listConflictClasses() {
    return this.svc.listConflictClasses();
  }

  @Get('priority-hierarchy')
  @ApiOperation({ summary: 'Get the 8-level priority hierarchy (highest first)' })
  @ApiOkResponse({ description: 'Priority hierarchy.' })
  async priorityHierarchy() {
    return this.svc.getPriorityHierarchy();
  }

  @Get('playbooks')
  @ApiOperation({ summary: 'List the 10 playbook constraint mappings' })
  @ApiOkResponse({ description: 'Playbook constraint mappings.' })
  async listPlaybooks() {
    return this.svc.listPlaybooks();
  }

  @Get('check-sequence')
  @ApiOperation({ summary: 'Get the 13-step SECH-FIC check sequence definition' })
  @ApiOkResponse({ description: 'Check sequence steps.' })
  async checkSequence() {
    return this.svc.getCheckSequence();
  }
}
