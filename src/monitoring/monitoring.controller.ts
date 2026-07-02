import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ThrottlerGuard } from '../security/throttler.guard';
import { Throttle } from '../security/throttle.decorator';
import { HealthChecksService } from './health-checks.service';
import { BackupService } from './backup.service';
import { QueueService } from '../queues/queue.service';
import { QUEUE_NAMES } from '../queues/queues.constants';

@ApiTags('Monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly health: HealthChecksService,
    private readonly backup: BackupService,
    private readonly queues: QueueService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Deep health checks (database, AI providers, constitution, redis)' })
  @ApiOkResponse({ description: 'Aggregated deep health status.' })
  async deepHealth() {
    return this.health.runAll();
  }

  @Get('queues')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Background queue statistics' })
  @ApiOkResponse({ description: 'Per-queue enqueued/completed/failed/pending counts.' })
  queueStats() {
    return this.queues.getStats();
  }

  @Post('queues/:queue/enqueue')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enqueue a job onto a background queue' })
  @ApiOkResponse({ description: 'Enqueue result.' })
  async enqueue(@Param('queue') queue: string, @Body() body: Record<string, unknown>) {
    if (!QUEUE_NAMES.includes(queue as (typeof QUEUE_NAMES)[number])) {
      return { queued: false, reason: 'unknown_queue' };
    }
    return this.queues.enqueue(queue, body ?? {}, { sync: true });
  }

  @Post('iurg-export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export the workspace IURG graph for disaster recovery' })
  @ApiOkResponse({ description: 'IURG snapshot summary.' })
  async iurgExport(@Req() req: any) {
    return this.backup.exportIurg(req.user.workspaceId);
  }

  @Get('rate-test')
  @UseGuards(ThrottlerGuard)
  @Throttle({ ttl: 60, limit: 5, enforceInTest: true })
  @ApiOperation({ summary: 'Rate-limit probe (5/min) — used to verify throttling' })
  @ApiOkResponse({ description: 'OK until the limit is exceeded (then 429).' })
  rateTest() {
    return { ok: true };
  }
}
