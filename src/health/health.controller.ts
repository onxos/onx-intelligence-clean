import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check with database connectivity' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: { status: 'up', version: '1.0.0' } };
    } catch (error: any) {
      return {
        status: 'degraded',
        database: { status: 'down', message: error.message || 'Database unavailable' },
      };
    }
  }
}
