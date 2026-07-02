import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { ExceptionService } from './exception.service';
import { ExceptionListQueryDto, TriggerOverrideDto } from './dto/exception.dto';

@ApiTags('D18 Exception Handling')
@Controller('exception')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExceptionController {
  constructor(private readonly svc: ExceptionService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Get('handlers')
  @ApiOperation({ summary: 'List the 5 override handlers (OR-01..OR-05)' })
  @ApiOkResponse({ description: 'Handler registry.' })
  async handlers() {
    return this.svc.listHandlers();
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Trigger an override (OR-01..OR-05)' })
  @ApiBody({ type: TriggerOverrideDto })
  @ApiOkResponse({ description: 'The override execution.' })
  async trigger(@Req() req: any, @Body() body: TriggerOverrideDto) {
    return this.svc.trigger(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('executions')
  @ApiOperation({ summary: 'List override executions (active by default)' })
  @ApiOkResponse({ description: 'Paginated executions.' })
  async executions(@Req() req: any, @Query() query: ExceptionListQueryDto) {
    return this.svc.listExecutions(req.user.workspaceId, query);
  }

  @Post(':id/revert')
  @ApiOperation({ summary: 'Revert an active override' })
  @ApiOkResponse({ description: 'The reverted execution.' })
  async revert(@Req() req: any, @Param('id') id: string) {
    return this.svc.revert(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }
}
