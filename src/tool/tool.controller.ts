import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ToolService } from './tool.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';

@ApiTags('Tool')
@Controller('tools')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ToolController {
  constructor(private readonly svc: ToolService) {}

  @Get()
  @ApiOperation({ summary: 'List all tools' })
  async list(@Req() req: any, @Query() query: any) {
    return this.svc.findAll(req.user.workspaceId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tool profile details' })
  async get(@Param('id') id: string, @Req() req: any) {
    return this.svc.findOne(req.user.workspaceId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create tool profile' })
  async create(@Body() body: any, @Req() req: any) {
    return this.svc.create(req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update tool profile' })
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.svc.update(req.user.workspaceId, id, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tool profile' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(req.user.workspaceId, id, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }
}
