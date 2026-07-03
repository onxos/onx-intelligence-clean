import { Controller, Get, Post, Body, Query, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IntelligenceService } from './intelligence.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@ApiTags('Intelligence')
@Controller('intelligence')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class IntelligenceController {
  constructor(private readonly svc: IntelligenceService) {}

  @Post()
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Create intelligence object' })
  async create(@Body() body: any, @Req() req: any) {
    return this.svc.create({
      ...body,
      ownerId: req.user.userId,
      creatorId: req.user.userId,
      workspaceId: req.user.workspaceId,
    });
  }

  @Get()
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'List intelligence objects' })
  async list(@Query() query: any, @Req() req: any) {
    return this.svc.findAll(req.user.workspaceId, query);
  }

  @Get('stats')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Get intelligence statistics' })
  async stats(@Req() req: any) {
    return this.svc.stats(req.user.workspaceId);
  }

  @Get(':id')
  @RequirePermissions(Permission.AI_CHAT)
  @ApiOperation({ summary: 'Get single intelligence object' })
  async get(@Param('id') id: string, @Req() req: any) {
    return this.svc.findOne(id, req.user.workspaceId);
  }
}
