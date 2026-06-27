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
import { ProviderService } from './provider.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';

@ApiTags('Provider')
@Controller('providers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProviderController {
  constructor(private readonly svc: ProviderService) {}

  @Get()
  @ApiOperation({ summary: 'List all providers' })
  async list(@Req() req: any, @Query() query: any) {
    return this.svc.findAll(req.user.workspaceId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create provider profile' })
  async create(@Body() body: any, @Req() req: any) {
    return this.svc.create(req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update provider profile' })
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.svc.update(req.user.workspaceId, id, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete provider profile' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(req.user.workspaceId, id, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate provider via ISES' })
  async evaluate(
    @Body() body: { providerId: string; intent: string; context?: string },
    @Req() req: any,
  ) {
    return this.svc.evaluate(body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }
}
