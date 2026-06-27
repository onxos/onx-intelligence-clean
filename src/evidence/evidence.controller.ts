import { Controller, Delete, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EvidenceService } from './evidence.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('Evidence')
@Controller('evidence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EvidenceController {
  constructor(private readonly svc: EvidenceService) {}

  @Get()
  @ApiOperation({ summary: 'List evidence records' })
  async list(@Req() req: any, @Query() query: any) {
    return this.svc.findAll(req.user.workspaceId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create evidence record' })
  async create(@Body() body: { intent: string; confidence?: number }, @Req() req: any) {
    return this.svc.create({
      intent: body.intent,
      confidence: body.confidence,
      ownerId: req.user.userId,
      workspaceId: req.user.workspaceId,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update evidence record' })
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.svc.update(id, req.user.workspaceId, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete evidence record' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(id, req.user.workspaceId);
  }
}
