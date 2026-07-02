import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
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
import { CheckModelsDto, ScanOutputDto, SfisListQueryDto } from './dto/sfis.dto';
import { SfisService } from './sfis.service';

@ApiTags('SFIS Shield')
@Controller('sfis')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SfisController {
  constructor(private readonly svc: SfisService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Post('scan')
  @ApiOperation({
    summary: 'Scan an output before delivery (L1 classification / L2 architecture drift)',
  })
  @ApiBody({ type: ScanOutputDto })
  @ApiOkResponse({
    description:
      'Scan verdict. 200 PASS, 202 FLAG (human review), 403 REJECT (commodity convergence).',
  })
  async scan(
    @Req() req: any,
    @Body() body: ScanOutputDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.svc.scan(req.user.workspaceId, req.user.userId, body, this.ctx(req));
    if (result.verdict === 'REJECT') {
      throw new ForbiddenException({
        message: 'Output blocked by SFIS (HC-05 commodity convergence).',
        ...result,
      });
    }
    if (result.verdict === 'FLAG') {
      res.status(HttpStatus.ACCEPTED);
    }
    return result;
  }

  @Get('status')
  @ApiOperation({ summary: 'SFIS shield status for the workspace' })
  @ApiOkResponse({ description: 'Shield status + model compliance + scan counts.' })
  async status(@Req() req: any) {
    return this.svc.getStatus(req.user.workspaceId);
  }

  @Get('models')
  @ApiOperation({ summary: 'Frontier AI model availability (all 6 monitored)' })
  @ApiOkResponse({ description: 'Model status list.' })
  async models(@Req() req: any) {
    return this.svc.listModels(req.user.workspaceId);
  }

  @Post('models/check')
  @ApiOperation({ summary: 'Force check all 6 frontier AI models (HC-06)' })
  @ApiBody({ type: CheckModelsDto, required: false })
  @ApiOkResponse({ description: 'Check result with per-model status + blocked flag.' })
  async checkModels(@Req() req: any, @Body() body: CheckModelsDto) {
    return this.svc.checkModels(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('startup')
  @ApiOperation({ summary: 'HC-06 startup enforcement — blocked if any frontier model is missing' })
  @ApiOkResponse({ description: 'Startup gate result.' })
  async startup(@Req() req: any) {
    return this.svc.startupCheck(req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Get('violations')
  @ApiOperation({ summary: 'HC-05 violation history (rejected scans)' })
  @ApiOkResponse({ description: 'Paginated violations.' })
  async violations(@Req() req: any, @Query() query: SfisListQueryDto) {
    return this.svc.listViolations(req.user.workspaceId, query);
  }

  @Get('drift-report')
  @ApiOperation({ summary: 'L2 architecture drift analysis' })
  @ApiOkResponse({ description: 'Drift report.' })
  async driftReport(@Req() req: any) {
    return this.svc.driftReport(req.user.workspaceId);
  }
}
