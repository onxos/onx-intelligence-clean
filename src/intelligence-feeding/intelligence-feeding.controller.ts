import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { IntelligenceFeedingService } from './intelligence-feeding.service';
import {
  AdvanceFeedDto,
  CreateSourceDto,
  FeedListQueryDto,
  IngestFeedDto,
  SetShadowModeDto,
  SourceListQueryDto,
  UpdateSourceDto,
} from './dto/intelligence-feeding.dto';

@ApiTags('Intelligence Feeding')
@Controller('intelligence-feeding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IntelligenceFeedingController {
  constructor(private readonly svc: IntelligenceFeedingService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  // Source Registry -------------------------------------------------------

  @Post('sources')
  @ApiOperation({ summary: 'Register an intelligence source' })
  @ApiBody({ type: CreateSourceDto })
  async createSource(@Req() req: any, @Body() body: CreateSourceDto) {
    return this.svc.createSource(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('sources')
  @ApiOperation({ summary: 'List intelligence sources' })
  async listSources(@Req() req: any, @Query() query: SourceListQueryDto) {
    return this.svc.listSources(req.user.workspaceId, query);
  }

  @Get('sources/:id')
  @ApiOperation({ summary: 'Get an intelligence source' })
  async getSource(@Req() req: any, @Param('id') id: string) {
    return this.svc.getSource(id, req.user.workspaceId);
  }

  @Put('sources/:id')
  @ApiOperation({ summary: 'Update an intelligence source' })
  @ApiBody({ type: UpdateSourceDto })
  async updateSource(@Req() req: any, @Param('id') id: string, @Body() body: UpdateSourceDto) {
    return this.svc.updateSource(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Delete('sources/:id')
  @ApiOperation({ summary: 'Soft delete an intelligence source' })
  async removeSource(@Req() req: any, @Param('id') id: string) {
    return this.svc.removeSource(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  @Post('sources/:id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted intelligence source' })
  async restoreSource(@Req() req: any, @Param('id') id: string) {
    return this.svc.restoreSource(id, req.user.workspaceId, req.user.userId, this.ctx(req));
  }

  // Feed Pipeline ---------------------------------------------------------

  @Post('feeds')
  @ApiOperation({ summary: 'Ingest a feed into the pipeline (stage RECEIVED)' })
  @ApiBody({ type: IngestFeedDto })
  async ingestFeed(@Req() req: any, @Body() body: IngestFeedDto) {
    return this.svc.ingestFeed(req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('feeds')
  @ApiOperation({ summary: 'List feeds' })
  async listFeeds(@Req() req: any, @Query() query: FeedListQueryDto) {
    return this.svc.listFeeds(req.user.workspaceId, query);
  }

  @Get('feeds/:id')
  @ApiOperation({ summary: 'Get a feed' })
  async getFeed(@Req() req: any, @Param('id') id: string) {
    return this.svc.getFeed(id, req.user.workspaceId);
  }

  @Post('feeds/:id/advance')
  @ApiOperation({ summary: 'Advance a feed through the staged ingestion pipeline' })
  @ApiBody({ type: AdvanceFeedDto })
  async advanceFeed(@Req() req: any, @Param('id') id: string, @Body() body: AdvanceFeedDto) {
    return this.svc.advanceFeed(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('feeds/:id/validate')
  @ApiOperation({ summary: 'Run the validation gate against a feed' })
  async validateFeed(@Req() req: any, @Param('id') id: string) {
    return this.svc.validateFeed(id, req.user.workspaceId);
  }

  @Post('feeds/:id/shadow')
  @ApiOperation({ summary: 'Set a feed shadow/quarantine mode (ACTIVE or SHADOW)' })
  @ApiBody({ type: SetShadowModeDto })
  async setShadow(@Req() req: any, @Param('id') id: string, @Body() body: SetShadowModeDto) {
    return this.svc.setShadowMode(id, req.user.workspaceId, req.user.userId, body, this.ctx(req));
  }

  @Get('feeds/:id/events')
  @ApiOperation({ summary: 'List pipeline events for a feed' })
  async listFeedEvents(@Req() req: any, @Param('id') id: string) {
    return this.svc.listFeedEvents(id, req.user.workspaceId);
  }
}
