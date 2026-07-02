import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { renderMetrics } from './metrics.registry';

/** Prometheus scrape endpoint (public, text exposition format). */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  get(): string {
    return renderMetrics();
  }
}
