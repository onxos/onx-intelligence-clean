import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AnalyzeVitalsDto } from './vitals-trending.dto';
import { VitalsTrendingService } from './vitals-trending.service';

@Controller('clinical/vitals')
@UseGuards(JwtAuthGuard)
export class VitalsTrendingController {
  constructor(private readonly service: VitalsTrendingService) {}

  @Get()
  list(@Query('patientId') patientId: string) {
    return this.service.list(patientId);
  }

  @Post('analyze')
  analyzeViaAlias(@Body() dto: AnalyzeVitalsDto, @Req() req: { user: { workspaceId: string } }) {
    return this.service.analyze(req.user.workspaceId, dto);
  }

  @Post('trends')
  analyze(@Body() dto: AnalyzeVitalsDto, @Req() req: { user: { workspaceId: string } }) {
    return this.service.analyze(req.user.workspaceId, dto);
  }
}