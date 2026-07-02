import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { IurgListQueryDto, IurgQueryDto } from './dto/iurg.dto';
import { IurgService } from './iurg.service';

@ApiTags('IURG Binding')
@Controller('iurg')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IurgController {
  constructor(private readonly svc: IurgService) {}

  @Get('intents')
  @ApiOperation({ summary: 'List Intent Objects' })
  @ApiOkResponse({ description: 'Paginated IURG intent objects.' })
  async listIntents(@Req() req: any, @Query() query: IurgListQueryDto) {
    return this.svc.listIntents(req.user.workspaceId, query);
  }

  @Get('intents/:id')
  @ApiOperation({ summary: 'Get a single Intent Object with its edges' })
  @ApiOkResponse({ description: 'IURG intent object + edges.' })
  async getIntent(@Req() req: any, @Param('id') id: string) {
    return this.svc.getIntent(id, req.user.workspaceId);
  }

  @Get('constraints')
  @ApiOperation({ summary: 'List Constraint Objects' })
  @ApiOkResponse({ description: 'Paginated IURG constraint objects.' })
  async listConstraints(@Req() req: any, @Query() query: IurgListQueryDto) {
    return this.svc.listConstraints(req.user.workspaceId, query);
  }

  @Get('enforcements')
  @ApiOperation({ summary: 'List Enforcement Objects' })
  @ApiOkResponse({ description: 'Paginated IURG enforcement objects.' })
  async listEnforcements(@Req() req: any, @Query() query: IurgListQueryDto) {
    return this.svc.listEnforcements(req.user.workspaceId, query);
  }

  @Get('violations')
  @ApiOperation({ summary: 'List Violation Objects' })
  @ApiOkResponse({ description: 'Paginated IURG violation objects.' })
  async listViolations(@Req() req: any, @Query() query: IurgListQueryDto) {
    return this.svc.listViolations(req.user.workspaceId, query);
  }

  @Get('conflicts')
  @ApiOperation({ summary: 'List Conflict Objects' })
  @ApiOkResponse({ description: 'Paginated IURG conflict objects.' })
  async listConflicts(@Req() req: any, @Query() query: IurgListQueryDto) {
    return this.svc.listConflicts(req.user.workspaceId, query);
  }

  @Get('overrides')
  @ApiOperation({ summary: 'List Override Objects' })
  @ApiOkResponse({ description: 'Paginated IURG override objects.' })
  async listOverrides(@Req() req: any, @Query() query: IurgListQueryDto) {
    return this.svc.listOverrides(req.user.workspaceId, query);
  }

  @Get('edges/:nodeId')
  @ApiOperation({ summary: 'Get all edges for a node (by node id, iurg id, or business ref)' })
  @ApiOkResponse({ description: 'All edges incident to the node.' })
  async getEdges(@Req() req: any, @Param('nodeId') nodeId: string) {
    return this.svc.getEdgesForNode(nodeId, req.user.workspaceId);
  }

  @Post('query')
  @ApiOperation({
    summary: 'Query IURG by intent_id, constraint_id, event_type, or timestamp range',
  })
  @ApiBody({ type: IurgQueryDto })
  @ApiOkResponse({ description: 'Matching nodes with their edges populated.' })
  async query(@Req() req: any, @Body() body: IurgQueryDto) {
    return this.svc.query(req.user.workspaceId, body);
  }
}
