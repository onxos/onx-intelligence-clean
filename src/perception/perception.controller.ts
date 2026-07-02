import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { IngestPerceptionDto, PerceptionListQueryDto } from './dto/perception.dto';
import { PerceptionService } from './perception.service';

@ApiTags('USFIP Perception Bus')
@Controller('usfip')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PerceptionController {
  constructor(private readonly svc: PerceptionService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Post('ingest')
  @ApiOperation({
    summary:
      'Unified perception entry point — validate, classify, rank (AC-05), FIC-check (SECH pre_judgment), route to IURG',
  })
  @ApiBody({ type: IngestPerceptionDto })
  @ApiOkResponse({
    description:
      'The persisted perception record with its 5-step pipeline trace and status (approved | rejected | flagged).',
  })
  async ingest(@Req() req: any, @Body() body: IngestPerceptionDto) {
    return this.svc.ingest(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('records')
  @ApiOperation({ summary: 'List perception records (filter by sourceType, status, domain, tier)' })
  @ApiOkResponse({ description: 'Paginated perception records.' })
  async listRecords(@Req() req: any, @Query() query: PerceptionListQueryDto) {
    return this.svc.listRecords(req.user.workspaceId, query);
  }

  @Get('tier-stats')
  @ApiOperation({ summary: 'Perception counts + average score by AC-05 evidence tier' })
  @ApiOkResponse({ description: 'Tier statistics.' })
  async tierStats(@Req() req: any) {
    return this.svc.tierStats(req.user.workspaceId);
  }

  @Get('quality-report')
  @ApiOperation({ summary: 'AC-05 evidence-quality compliance report' })
  @ApiOkResponse({ description: 'Quality report.' })
  async qualityReport(@Req() req: any) {
    return this.svc.qualityReport(req.user.workspaceId);
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'The 5-step USFIP perception pipeline definition' })
  @ApiOkResponse({ description: 'Pipeline steps.' })
  async pipeline() {
    return this.svc.listPipeline();
  }

  @Get('records/:id')
  @ApiOperation({ summary: 'Get a single perception record with routing history' })
  @ApiOkResponse({ description: 'The record + SECH route + IURG edges.' })
  async getRecord(@Req() req: any, @Param('id') id: string) {
    return this.svc.getRecord(id, req.user.workspaceId);
  }
}
