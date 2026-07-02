import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { ThrottlerGuard } from '../security/throttler.guard';
import { Throttle } from '../security/throttle.decorator';
import { THROTTLER_CONFIG } from '../security/throttler.config';
import { SechPendingQueryDto, SechRouteRequestDto } from './dto/sech.dto';
import { SechRouterService } from './sech-router.service';

@ApiTags('SECH Router')
@Controller('sech')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle(THROTTLER_CONFIG.sech)
@ApiBearerAuth()
export class SechRouterController {
  constructor(private readonly svc: SechRouterService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Post('route')
  @ApiOperation({
    summary:
      'Route a decision through the 4 SECH-FIC gates (pre_judgment, pre_decision, pre_execution, post_outcome)',
  })
  @ApiBody({ type: SechRouteRequestDto })
  @ApiOkResponse({
    description:
      'Routing result. 403 when a gate REJECTS (with counter-proposal), 409 when a gate raises a CONFLICT (paused for human escalation), otherwise the completed route (APPROVED / OVERRIDE with conditions).',
  })
  async route(@Req() req: any, @Body() body: SechRouteRequestDto) {
    const result = await this.svc.route(req.user.workspaceId, req.user.userId, body, this.ctx(req));
    if (result.status === 'REJECTED') {
      throw new ForbiddenException({ message: 'Decision blocked by SECH-FIC gate.', ...result });
    }
    if (result.status === 'CONFLICT') {
      throw new ConflictException({
        message: 'Decision paused by SECH-FIC gate; escalated for human resolution.',
        ...result,
      });
    }
    return result;
  }

  @Get('gates')
  @ApiOperation({ summary: 'List the SECH gates and the most recent route result' })
  @ApiOkResponse({ description: 'Gate definitions + last route summary.' })
  async gates(@Req() req: any) {
    return this.svc.gatesStatus(req.user.workspaceId);
  }

  @Get('pending')
  @ApiOperation({ summary: 'List routes paused at CONFLICT awaiting human resolution' })
  @ApiOkResponse({ description: 'Paginated pending (CONFLICT) routes.' })
  async pending(@Req() req: any, @Query() query: SechPendingQueryDto) {
    return this.svc.listPending(req.user.workspaceId, query);
  }

  @Get('routes/:id')
  @ApiOperation({ summary: 'Get a single SECH route by id' })
  @ApiOkResponse({ description: 'The SECH route.' })
  async getRoute(@Req() req: any, @Param('id') id: string) {
    const route = await this.svc.getRoute(id, req.user.workspaceId);
    if (!route) {
      throw new NotFoundException('SECH route not found');
    }
    return route;
  }
}
