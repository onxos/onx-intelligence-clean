import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { BuildSoapNoteDto } from './soap-intelligence.dto';
import { SoapIntelligenceService } from './soap-intelligence.service';

@Controller('clinical/soap')
@UseGuards(JwtAuthGuard)
export class SoapIntelligenceController {
  constructor(private readonly service: SoapIntelligenceService) {}

  @Get()
  list(@Query('patientId') patientId?: string) {
    return this.service.list(patientId);
  }

  @Post('notes')
  build(@Body() dto: BuildSoapNoteDto, @Req() req: { user: { workspaceId: string } }) {
    return this.service.buildNote(req.user.workspaceId, dto);
  }
}