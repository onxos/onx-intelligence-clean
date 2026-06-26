import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ToolService } from './tool.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('Tool')
@Controller('tools')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ToolController {
  constructor(private readonly svc: ToolService) {}

  @Get()
  @ApiOperation({ summary: 'List all tools' })
  async list(@Req() req: any) {
    return this.svc.findAll(req.user.workspaceId);
  }
}
