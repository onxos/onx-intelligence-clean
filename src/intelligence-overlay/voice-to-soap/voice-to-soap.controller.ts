import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { VoiceStreamDto, VoiceToSoapDto } from './voice-to-soap.dto';
import { VoiceToSoapService } from './voice-to-soap.service';

@ApiTags('Intelligence Overlay')
@ApiBearerAuth()
@Controller('intelligence/voice')
@UseGuards(JwtAuthGuard)
export class VoiceToSoapController {
  constructor(private readonly service: VoiceToSoapService) {}

  @Post('soap')
  @ApiOperation({ summary: 'Upload audio and convert it to SOAP' })
  @ApiResponse({ status: 201, description: 'SOAP note generated' })
  soap(@Req() req: { user: { workspaceId: string; userId: string } }, @Body() dto: VoiceToSoapDto) {
    return this.service.convert(req.user.workspaceId, req.user.userId, dto);
  }

  @Post('soap/stream')
  @ApiOperation({ summary: 'Stream audio chunks and convert to SOAP' })
  @ApiResponse({ status: 201, description: 'SOAP note generated from stream' })
  stream(@Req() req: { user: { workspaceId: string; userId: string } }, @Body() dto: VoiceStreamDto) {
    return this.service.stream(req.user.workspaceId, req.user.userId, dto);
  }

  @Get('templates')
  @ApiOperation({ summary: 'List SOAP templates' })
  templates() {
    return this.service.templates();
  }
}
