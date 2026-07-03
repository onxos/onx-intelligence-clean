import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/jwt.guard';
import { AnalyzerInterfaceService } from './analyzer-interface.service';

@ApiTags('Clinical')
@Controller('clinical/lab/analyzer')
@UseGuards(JwtAuthGuard)
export class AnalyzerInterfaceController {
  constructor(private readonly service: AnalyzerInterfaceService) {}

  @Post('import')
  importFromAnalyzer(
    @Req() req: { user: { workspaceId: string } },
    @Body()
    dto: {
      analyzerId?: string;
      orderId: string;
      patientId: string;
      results: Array<{
        testCode: string;
        testName: string;
        value: string;
        unit: string;
        referenceRange: string;
        status?: string;
        notes?: string;
      }>;
    },
  ) {
    return this.service.importFromAnalyzer(req.user.workspaceId, dto);
  }

  @Get('status')
  status() {
    return this.service.status();
  }

  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.service.sync(id);
  }
}
