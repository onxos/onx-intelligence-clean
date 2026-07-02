import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { AssessmentService } from './assessment.service';
import { RunAssessmentDto } from './dto/assessment.dto';

@ApiTags('D15 Self-Assessment')
@Controller('assessment')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AssessmentController {
  constructor(private readonly svc: AssessmentService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Post('run')
  @ApiOperation({ summary: 'Run a self-assessment against Founder Intent (HC-08)' })
  @ApiBody({ type: RunAssessmentDto })
  @ApiOkResponse({ description: 'The assessment result with intent alignment + gaps.' })
  async run(@Req() req: any, @Body() body: RunAssessmentDto) {
    return this.svc.run(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('gaps')
  @ApiOperation({ summary: 'List unresolved constitutional gaps' })
  @ApiOkResponse({ description: 'Unresolved gaps.' })
  async gaps(@Req() req: any) {
    return this.svc.listGaps(req.user.workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an assessment result' })
  @ApiOkResponse({ description: 'The assessment.' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getById(id, req.user.workspaceId);
  }
}
