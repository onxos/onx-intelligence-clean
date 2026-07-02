import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { ContinuityService } from './continuity.service';
import {
  ContinuityListQueryDto,
  ContinuityWriteDto,
  GuardOperationDto,
} from './dto/continuity.dto';

@ApiTags('Continuity (Append-Only)')
@Controller('continuity')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContinuityController {
  constructor(private readonly svc: ContinuityService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Post('guard')
  @ApiOperation({
    summary:
      'Route a proposed operation through the continuity guard (UPDATE/DELETE blocked → 403)',
  })
  @ApiBody({ type: GuardOperationDto })
  @ApiOkResponse({ description: 'Guard result. 403 when the operation is blocked (HC-04).' })
  async guard(@Req() req: any, @Body() body: GuardOperationDto) {
    const result = await this.svc.guardOperation(
      req.user.workspaceId,
      req.user.userId,
      body,
      this.ctx(req),
    );
    if (result.blocked) {
      throw new ForbiddenException({
        message: 'Operation blocked by Continuity (HC-04 append-only).',
        ...result,
      });
    }
    return result;
  }

  @Post('revise')
  @ApiOperation({ summary: 'Append a revised version (HC-04)' })
  @ApiBody({ type: ContinuityWriteDto })
  @ApiOkResponse({ description: 'The continuity audit entry.' })
  async revise(@Req() req: any, @Body() body: ContinuityWriteDto) {
    return this.svc.revise(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('supersede')
  @ApiOperation({ summary: 'Append a superseding version (old preserved)' })
  @ApiBody({ type: ContinuityWriteDto })
  @ApiOkResponse({ description: 'The continuity audit entry.' })
  async supersede(@Req() req: any, @Body() body: ContinuityWriteDto) {
    return this.svc.supersede(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Post('deprecate')
  @ApiOperation({ summary: 'Deprecate a version (marked obsolete, still preserved)' })
  @ApiBody({ type: ContinuityWriteDto })
  @ApiOkResponse({ description: 'The continuity audit entry.' })
  async deprecate(@Req() req: any, @Body() body: ContinuityWriteDto) {
    return this.svc.deprecate(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('audits')
  @ApiOperation({ summary: 'List the continuity audit trail' })
  @ApiOkResponse({ description: 'Paginated audit entries.' })
  async audits(@Req() req: any, @Query() query: ContinuityListQueryDto) {
    return this.svc.listAudits(req.user.workspaceId, query);
  }

  @Get('protected-objects')
  @ApiOperation({ summary: 'List the protected object types + evidence tiers' })
  @ApiOkResponse({ description: 'Protected object types.' })
  async protectedObjects(@Req() req: any) {
    return this.svc.protectedObjects(req.user.workspaceId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Continuity statistics per workspace' })
  @ApiOkResponse({ description: 'Continuity statistics.' })
  async stats(@Req() req: any) {
    return this.svc.stats(req.user.workspaceId);
  }

  @Get('object/:type/:id/history')
  @ApiOperation({ summary: 'Full append-only version history for a protected object' })
  @ApiOkResponse({ description: 'Version history.' })
  async history(@Req() req: any, @Param('type') type: string, @Param('id') id: string) {
    return this.svc.objectHistory(type, id, req.user.workspaceId);
  }

  @Get('audits/:id')
  @ApiOperation({ summary: 'Get a single continuity audit entry' })
  @ApiOkResponse({ description: 'The audit entry.' })
  async audit(@Req() req: any, @Param('id') id: string) {
    return this.svc.getAudit(id, req.user.workspaceId);
  }
}
