import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProviderService } from './provider.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('Provider')
@Controller('providers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProviderController {
  constructor(private readonly svc: ProviderService) {}

  @Get()
  @ApiOperation({ summary: 'List all providers' })
  async list(@Req() req: any) {
    return this.svc.findAll(req.user.workspaceId);
  }

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate provider via ISES' })
  async evaluate(@Body() body: { providerId: string; intent: string; context?: string }) {
    return this.svc.evaluate(body);
  }
}
