import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SovereigntyService } from './sovereignty.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('Sovereignty')
@Controller('sovereignty')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SovereigntyController {
  constructor(private readonly svc: SovereigntyService) {}

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate sovereignty for intent' })
  async evaluate(@Body() body: { intent: string }, @Req() req: any) {
    return this.svc.evaluate(body.intent, req.user.workspaceId);
  }

  @Get('report')
  @ApiOperation({ summary: 'Get sovereignty report' })
  async report(@Req() req: any) {
    return this.svc.report(req.user.workspaceId);
  }
}
