import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { InteractionVerificationDto, TreatmentRecommendationDto } from './treatment-recommender.dto';
import { TreatmentRecommenderService } from './treatment-recommender.service';

@ApiTags('Intelligence Overlay')
@ApiBearerAuth()
@Controller('intelligence/treatment')
@UseGuards(JwtAuthGuard)
export class TreatmentRecommenderController {
  constructor(private readonly service: TreatmentRecommenderService) {}

  @Post('recommend')
  @ApiOperation({ summary: 'Get treatment options for a diagnosis' })
  @ApiResponse({ status: 201, description: 'Treatment recommendations returned' })
  recommend(@Req() req: { user: { workspaceId: string; userId: string } }, @Body() dto: TreatmentRecommendationDto) {
    return this.service.recommend(req.user.workspaceId, req.user.userId, dto);
  }

  @Get('protocols')
  @ApiOperation({ summary: 'Browse available protocols' })
  protocols() {
    return this.service.protocols();
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify drug interactions' })
  verify(@Body() dto: InteractionVerificationDto) {
    return this.service.verify(dto);
  }
}
