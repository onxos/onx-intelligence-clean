import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import {
  FounderIntentCompileDto,
  FounderIntentCompileResultDto,
  FounderIntentHistoryItemDto,
  FounderIntentHistoryQueryDto,
  FounderIntentSimulationResultDto,
  FounderIntentSimulateDto,
  FounderIntentValidateDto,
  FounderIntentValidationResultDto,
} from './dto/founder-intent.dto';
import { FounderIntentService } from './founder-intent.service';

@ApiTags('Founder Intent')
@Controller('founder-intent')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FounderIntentController {
  constructor(private readonly svc: FounderIntentService) {}

  @Post('compile')
  @ApiOperation({
    summary: 'Compile founder intent into execution directives and graph',
    description:
      'Consumes founder intent payload and orchestrates existing ONX platform entities to produce execution directives.',
  })
  @ApiBody({ type: FounderIntentCompileDto })
  @ApiOkResponse({ type: FounderIntentCompileResultDto })
  async compile(@Req() req: any, @Body() body: FounderIntentCompileDto) {
    return this.svc.compile(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Post('validate')
  @ApiOperation({
    summary: 'Validate founder intent consistency and dependencies',
    description:
      'Performs validation checks for objective completeness, contradiction detection, priority conflicts, and missing dependencies.',
  })
  @ApiBody({ type: FounderIntentValidateDto })
  @ApiOkResponse({ type: FounderIntentValidationResultDto })
  async validate(@Req() req: any, @Body() body: FounderIntentValidateDto) {
    return this.svc.validate(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Post('simulate')
  @ApiOperation({
    summary: 'Simulate execution plan without mutation',
    description:
      'Produces execution sequencing, dependency ordering, module impact, and risk projection without mutating domain state.',
  })
  @ApiBody({ type: FounderIntentSimulateDto })
  @ApiOkResponse({ type: FounderIntentSimulationResultDto })
  async simulate(@Req() req: any, @Body() body: FounderIntentSimulateDto) {
    return this.svc.simulate(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('history')
  @ApiOperation({ summary: 'List founder intent compile history for workspace' })
  @ApiOkResponse({ type: FounderIntentHistoryItemDto, isArray: true })
  async history(@Req() req: any, @Query() query: FounderIntentHistoryQueryDto) {
    return this.svc.history(req.user.workspaceId, req.user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get founder intent compiled record by id' })
  @ApiOkResponse({ type: FounderIntentCompileResultDto })
  async getById(@Req() req: any, @Param('id') id: string) {
    return this.svc.getById(req.user.workspaceId, req.user.userId, id);
  }
}
