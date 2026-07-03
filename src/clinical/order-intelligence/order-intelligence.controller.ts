import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { ClinicalOrderRecommendationDto, CreateClinicalOrderDto } from './order-intelligence.dto';
import { OrderIntelligenceService } from './order-intelligence.service';

@Controller('clinical/orders')
@UseGuards(JwtAuthGuard)
export class OrderIntelligenceController {
  constructor(private readonly service: OrderIntelligenceService) {}

  @Post()
  create(@Body() dto: CreateClinicalOrderDto, @Req() req: { user: { workspaceId: string } }) {
    const symptoms = [dto.type, dto.testCode].filter(Boolean) as string[];
    const currentMedications = dto.medicationName ? [dto.medicationName] : [];
    return this.service.recommend(req.user.workspaceId, {
      patientId: dto.patientId,
      chiefComplaint: dto.type,
      symptoms,
      currentMedications,
    });
  }

  @Post('recommendations')
  recommend(@Body() dto: ClinicalOrderRecommendationDto, @Req() req: { user: { workspaceId: string } }) {
    return this.service.recommend(req.user.workspaceId, dto);
  }
}