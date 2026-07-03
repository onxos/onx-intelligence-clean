import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { DiagnosticAssistantService } from './diagnostic-assistant.service';
import { DiagnoseDto, DiagnosisFeedbackDto } from './diagnostic-assistant.dto';

@ApiTags('Intelligence Overlay')
@ApiBearerAuth()
@Controller('intelligence/diagnose')
@UseGuards(JwtAuthGuard)
export class DiagnosticAssistantController {
  constructor(private readonly service: DiagnosticAssistantService) {}

  @Post()
  @ApiOperation({ summary: 'Submit symptoms for differential diagnosis' })
  @ApiResponse({ status: 201, description: 'Returns ranked differential diagnosis' })
  diagnose(@Req() req: { user: { workspaceId: string; userId: string } }, @Body() dto: DiagnoseDto) {
    return this.service.diagnose(req.user.workspaceId, req.user.userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get diagnosis result' })
  @ApiResponse({ status: 200, description: 'Diagnosis result found' })
  getById(@Req() req: { user: { workspaceId: string } }, @Param('id') id: string) {
    return this.service.getById(req.user.workspaceId, id);
  }

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Provide feedback on diagnosis result' })
  @ApiResponse({ status: 200, description: 'Feedback stored' })
  feedback(
    @Req() req: { user: { workspaceId: string } },
    @Param('id') id: string,
    @Body() dto: DiagnosisFeedbackDto,
  ) {
    return this.service.feedback(req.user.workspaceId, id, dto);
  }
}
