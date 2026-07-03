import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AnalyzeVitalsDto } from './vitals-trending.dto';
import { VitalsTrendingService } from './vitals-trending.service';

@Controller('clinical/vitals')
@UseGuards(JwtAuthGuard)
export class VitalsTrendingController {
  constructor(private readonly service: VitalsTrendingService) {}

  @Post('trends')
  analyze(@Body() dto: AnalyzeVitalsDto) {
    return this.service.analyze(dto);
  }
}