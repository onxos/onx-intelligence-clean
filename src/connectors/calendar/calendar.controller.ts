import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { getRequestAuditContext } from '../../common/audit-context.util';
import { CalendarService } from './calendar.service';
import { SyncConnectorDto } from '../dto/connector.dto';

@ApiTags('Connectors — Calendar')
@Controller('connectors/calendar')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Post('sync')
  @ApiOperation({ summary: 'Pull calendar events into the USFIP bus (tier 2, operational)' })
  @ApiBody({ type: SyncConnectorDto })
  @ApiOkResponse({ description: 'Sync summary with per-event SC-09 flags.' })
  async sync(@Req() req: any, @Body() body: SyncConnectorDto) {
    return this.calendar.sync(req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }
}
