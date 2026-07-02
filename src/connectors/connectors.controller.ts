import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { ConnectorsService } from './connectors.service';
import { ConfigureConnectorDto, ConnectorLogQueryDto } from './dto/connector.dto';

@ApiTags('Connectors')
@Controller('connectors')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConnectorsController {
  constructor(private readonly svc: ConnectorsService) {}

  private ctx(req: any) {
    return { actorId: req.user.userId, ...getRequestAuditContext(req) };
  }

  @Get()
  @ApiOperation({ summary: 'List configured connectors for the workspace' })
  @ApiOkResponse({ description: 'Connector configs (credentials redacted).' })
  async list(@Req() req: any) {
    return this.svc.listConfigs(req.user.workspaceId);
  }

  @Post(':connector/config')
  @ApiOperation({ summary: 'Configure (upsert) a connector provider' })
  @ApiBody({ type: ConfigureConnectorDto })
  @ApiOkResponse({ description: 'The saved connector config (credentials redacted).' })
  async configure(
    @Req() req: any,
    @Param('connector') connector: string,
    @Body() body: ConfigureConnectorDto,
  ) {
    const c = this.svc.assertConnector(connector);
    return this.svc.configure(req.user.workspaceId, c, body, this.ctx(req));
  }

  @Get(':connector/status')
  @ApiOperation({ summary: 'Connector health + last event summary' })
  @ApiOkResponse({ description: 'Connector status.' })
  async status(@Req() req: any, @Param('connector') connector: string) {
    const c = this.svc.assertConnector(connector);
    return this.svc.status(req.user.workspaceId, c);
  }

  @Get(':connector/logs')
  @ApiOperation({ summary: 'Ingestion logs for a connector' })
  @ApiOkResponse({ description: 'Paginated connector logs.' })
  async logs(
    @Req() req: any,
    @Param('connector') connector: string,
    @Query() query: ConnectorLogQueryDto,
  ) {
    const c = this.svc.assertConnector(connector);
    return this.svc.listLogs(req.user.workspaceId, c, query);
  }

  @Get(':connector/stats')
  @ApiOperation({ summary: 'Connector ingestion statistics' })
  @ApiOkResponse({ description: 'Connector stats.' })
  async stats(@Req() req: any, @Param('connector') connector: string) {
    const c = this.svc.assertConnector(connector);
    return this.svc.stats(req.user.workspaceId, c);
  }
}
