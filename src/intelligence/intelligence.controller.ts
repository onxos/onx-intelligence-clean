import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IntelligenceService } from './intelligence.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('Intelligence')
@Controller('intelligence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IntelligenceController {
  constructor(private readonly svc: IntelligenceService) {}

  @Post()
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
  @ApiOperation({ summary: 'List intelligence objects' })
  async list(@Query() query: any, @Req() req: any) {
    return this.svc.findAll(req.user.workspaceId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get intelligence statistics' })
  async stats(@Req() req: any) {
    return this.svc.stats(req.user.workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single intelligence object' })
  async get(@Param('id') id: string, @Req() req: any) {
    return this.svc.findOne(id, req.user.workspaceId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update intelligence object' })
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.svc.update(id, req.user.workspaceId, req.user.userId, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete intelligence object' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(id, req.user.workspaceId, req.user.userId);
  }
}
