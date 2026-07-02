import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { getRequestAuditContext } from '../../common/audit-context.util';
import { EmrService } from './emr.service';
import { SyncConnectorDto } from '../dto/connector.dto';

@ApiTags('Connectors — EMR')
@Controller('connectors/emr')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmrController {
  constructor(private readonly emr: EmrService) {}

  @Post('sync')
  @ApiOperation({ summary: 'Pull EMR patient records into the USFIP bus (tier 1, clinical)' })
  @ApiBody({ type: SyncConnectorDto })
  @ApiOkResponse({ description: 'Sync summary with per-record ingestion results.' })
  async sync(@Req() req: any, @Body() body: SyncConnectorDto) {
    return this.emr.sync(req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }
}
