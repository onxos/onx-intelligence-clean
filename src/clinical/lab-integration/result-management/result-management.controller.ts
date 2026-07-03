import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/jwt.guard';
import { CreateLabResultDto, ListLabResultsQueryDto, ReviewLabResultDto } from './result-management.dto';
import { ResultManagementService } from './result-management.service';

@ApiTags('Clinical')
@Controller('clinical/lab/results')
@UseGuards(JwtAuthGuard)
export class ResultManagementController {
  constructor(private readonly service: ResultManagementService) {}

  @Post()
  create(@Req() req: { user: { workspaceId: string } }, @Body() dto: CreateLabResultDto) {
    return this.service.create(req.user.workspaceId, dto);
  }

  @Get()
  list(@Req() req: { user: { workspaceId: string } }, @Query() query: ListLabResultsQueryDto) {
    return this.service.list(req.user.workspaceId, query);
  }

  @Get(':id')
  get(@Req() req: { user: { workspaceId: string } }, @Param('id') id: string) {
    return this.service.getById(req.user.workspaceId, id);
  }

  @Patch(':id/review')
  review(
    @Req() req: { user: { workspaceId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: ReviewLabResultDto,
  ) {
    return this.service.review(req.user.workspaceId, id, req.user.userId, dto);
  }

  @Get(':id/interpret')
  interpret(@Req() req: { user: { workspaceId: string; userId: string } }, @Param('id') id: string) {
    return this.service.interpret(req.user.workspaceId, req.user.userId, id);
  }
}
