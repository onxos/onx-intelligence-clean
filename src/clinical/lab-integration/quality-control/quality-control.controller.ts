import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/jwt.guard';
import { CreateLabQualityControlDto, ListLabQualityControlQueryDto } from './quality-control.dto';
import { QualityControlService } from './quality-control.service';

@ApiTags('Clinical')
@Controller('clinical/lab/qc')
@UseGuards(JwtAuthGuard)
export class QualityControlController {
  constructor(private readonly service: QualityControlService) {}

  @Post()
  create(@Req() req: { user: { workspaceId: string } }, @Body() dto: CreateLabQualityControlDto) {
    return this.service.create(req.user.workspaceId, dto);
  }

  @Get()
  list(@Req() req: { user: { workspaceId: string } }, @Query() query: ListLabQualityControlQueryDto) {
    return this.service.list(req.user.workspaceId, query);
  }

  @Get('stats')
  stats(@Req() req: { user: { workspaceId: string } }) {
    return this.service.stats(req.user.workspaceId);
  }
}
