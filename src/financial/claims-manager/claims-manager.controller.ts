import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { ClaimsManagerService } from './claims-manager.service';
import { CreateClaimDto, ListClaimsQueryDto, UpdateClaimStatusDto } from './claims-manager.dto';

@ApiTags('Financial')
@Controller('financial/claims')
@UseGuards(JwtAuthGuard)
export class ClaimsManagerController {
  constructor(private readonly service: ClaimsManagerService) {}

  @Post()
  create(@Req() req: { user: { workspaceId: string } }, @Body() dto: CreateClaimDto) {
    return this.service.create(req.user.workspaceId, dto);
  }

  @Get()
  list(@Req() req: { user: { workspaceId: string } }, @Query() query: ListClaimsQueryDto) {
    return this.service.list(req.user.workspaceId, query);
  }

  @Get(':id')
  getById(@Req() req: { user: { workspaceId: string } }, @Param('id') id: string) {
    return this.service.getById(req.user.workspaceId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: { user: { workspaceId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateClaimStatusDto,
  ) {
    return this.service.updateStatus(req.user.workspaceId, id, dto);
  }

  @Post(':id/appeal')
  appeal(@Req() req: { user: { workspaceId: string } }, @Param('id') id: string) {
    return this.service.appeal(req.user.workspaceId, id);
  }
}
