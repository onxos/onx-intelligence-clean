import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { ClinicalOrderRecommendationDto } from './order-intelligence.dto';
import { OrderIntelligenceService } from './order-intelligence.service';

@Controller('clinical/orders')
@UseGuards(JwtAuthGuard)
export class OrderIntelligenceController {
  constructor(private readonly service: OrderIntelligenceService) {}

  @Post('recommendations')
  recommend(@Body() dto: ClinicalOrderRecommendationDto, @Req() req: { user: { workspaceId: string } }) {
    return this.service.recommend(req.user.workspaceId, dto);
  }
}