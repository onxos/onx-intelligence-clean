import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AutoFillDto, OptimizeScheduleDto } from './smart-scheduling.dto';
import { SmartSchedulingService } from './smart-scheduling.service';

@ApiTags('Intelligence Overlay')
@ApiBearerAuth()
@Controller('intelligence/schedule')
@UseGuards(JwtAuthGuard)
export class SmartSchedulingController {
  constructor(private readonly service: SmartSchedulingService) {}

  @Post('optimize')
  @ApiOperation({ summary: 'Optimize the current schedule' })
  @ApiResponse({ status: 201, description: 'Optimized schedule returned' })
  optimize(@Req() req: { user: { workspaceId: string } }, @Body() dto: OptimizeScheduleDto) {
    return this.service.optimize(req.user.workspaceId, dto);
  }

  @Get('predictions')
  @ApiOperation({ summary: 'Predict no-shows' })
  predictions(@Req() req: { user: { workspaceId: string } }) {
    return this.service.predictions(req.user.workspaceId);
  }

  @Post('auto-fill')
  @ApiOperation({ summary: 'Auto-fill open schedule gaps' })
  @ApiResponse({ status: 201, description: 'Auto-fill suggestions returned' })
  autoFill(@Req() req: { user: { workspaceId: string } }, @Body() dto: AutoFillDto) {
    return this.service.autoFill(req.user.workspaceId, dto);
  }
}
