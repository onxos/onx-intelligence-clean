import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { BuildSoapNoteDto } from './soap-intelligence.dto';
import { SoapIntelligenceService } from './soap-intelligence.service';

@Controller('clinical/soap')
@UseGuards(JwtAuthGuard)
export class SoapIntelligenceController {
  constructor(private readonly service: SoapIntelligenceService) {}

  @Post('notes')
  build(@Body() dto: BuildSoapNoteDto) {
    return this.service.buildNote(dto);
  }
}