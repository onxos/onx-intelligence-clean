import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/jwt.guard';
import { CreateLabOrderDto, ListLabOrdersQueryDto, UpdateLabOrderStatusDto } from './lab-order.dto';
import { LabOrderService } from './lab-order.service';

@ApiTags('Clinical')
@Controller('clinical/lab/orders')
@UseGuards(JwtAuthGuard)
export class LabOrderController {
  constructor(private readonly service: LabOrderService) {}

  @Post()
  create(@Body() dto: CreateLabOrderDto, @Req() req: { user: { workspaceId: string; userId: string } }) {
    return this.service.create(req.user.workspaceId, req.user.userId, dto);
  }

  @Get()
  list(@Req() req: { user: { workspaceId: string } }, @Query() query: ListLabOrdersQueryDto) {
    return this.service.list(req.user.workspaceId, query);
  }

  @Get(':id')
  get(@Req() req: { user: { workspaceId: string } }, @Param('id') id: string) {
    return this.service.getById(req.user.workspaceId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: { user: { workspaceId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateLabOrderStatusDto,
  ) {
    return this.service.updateStatus(req.user.workspaceId, id, dto);
  }

  @Post(':id/cancel')
  cancel(@Req() req: { user: { workspaceId: string } }, @Param('id') id: string) {
    return this.service.cancel(req.user.workspaceId, id);
  }
}
