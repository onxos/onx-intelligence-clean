import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { JudgmentService } from './judgment.service';
import {
  FormJudgmentDto,
  JudgmentListQueryDto,
  PromoteJudgmentDto,
  ValidateJudgmentDto,
} from './dto/judgment.dto';

@ApiTags('Understanding → Judgment')
@Controller('judgment')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class JudgmentController {
  constructor(private readonly svc: JudgmentService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Post('form')
  @ApiOperation({ summary: 'Form a judgment from an understanding (realityTier >= probable)' })
  @ApiBody({ type: FormJudgmentDto })
  @ApiOkResponse({ description: 'The formed judgment object.' })
  async form(@Req() req: any, @Body() body: FormJudgmentDto) {
    return this.svc.form(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('objects')
  @ApiOperation({ summary: 'List judgment objects' })
  @ApiOkResponse({ description: 'Paginated judgment objects.' })
  async list(@Req() req: any, @Query() query: JudgmentListQueryDto) {
    return this.svc.listObjects(req.user.workspaceId, query);
  }

  @Get('pending-validation')
  @ApiOperation({ summary: 'Judgments with 3+ correct outcomes awaiting DG-09' })
  @ApiOkResponse({ description: 'Paginated judgments awaiting DG-09.' })
  async pendingValidation(@Req() req: any, @Query() query: JudgmentListQueryDto) {
    return this.svc.pendingValidation(req.user.workspaceId, query);
  }

  @Get('pending-institutional')
  @ApiOperation({ summary: 'Validated judgments at 2+ branches awaiting DG-10' })
  @ApiOkResponse({ description: 'Paginated judgments awaiting DG-10.' })
  async pendingInstitutional(@Req() req: any, @Query() query: JudgmentListQueryDto) {
    return this.svc.pendingInstitutional(req.user.workspaceId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Judgment statistics by status + reality tier' })
  @ApiOkResponse({ description: 'Judgment statistics.' })
  async stats(@Req() req: any) {
    return this.svc.stats(req.user.workspaceId);
  }

  @Get('objects/:id')
  @ApiOperation({ summary: 'Get a judgment object with its reasoning' })
  @ApiOkResponse({ description: 'The judgment object.' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getObject(id, req.user.workspaceId);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Record a validation outcome (correct/incorrect) for a judgment' })
  @ApiBody({ type: ValidateJudgmentDto })
  @ApiOkResponse({ description: 'The updated judgment.' })
  async validate(@Req() req: any, @Param('id') id: string, @Body() body: ValidateJudgmentDto) {
    return this.svc.validate(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post(':id/promote')
  @ApiOperation({ summary: 'Promote a judgment (DG-09 validated / DG-10 institutional)' })
  @ApiBody({ type: PromoteJudgmentDto })
  @ApiOkResponse({ description: 'The promoted judgment.' })
  async promote(@Req() req: any, @Param('id') id: string, @Body() body: PromoteJudgmentDto) {
    return this.svc.promote(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }
}
