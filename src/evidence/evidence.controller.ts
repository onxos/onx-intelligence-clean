import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EvidenceService } from './evidence.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@ApiTags('Evidence')
@Controller('evidence')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class EvidenceController {
  constructor(private readonly svc: EvidenceService) {}

  @Get()
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'List evidence records' })
  async list(@Req() req: any) {
    return this.svc.findAll(req.user.workspaceId);
  }

  @Post()
  @RequirePermissions(Permission.REPORT_CREATE)
  @ApiOperation({ summary: 'Create evidence record' })
  async create(@Body() body: { intent: string; confidence?: number }, @Req() req: any) {
    return this.svc.create({
      intent: body.intent,
      confidence: body.confidence,
      ownerId: req.user.userId,
      workspaceId: req.user.workspaceId,
    });
  }
}
