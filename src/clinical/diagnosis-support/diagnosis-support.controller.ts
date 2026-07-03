import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { ClinicalDiagnosisSupportDto } from './diagnosis-support.dto';
import { DiagnosisSupportService } from './diagnosis-support.service';

@Controller('clinical/diagnosis')
@UseGuards(JwtAuthGuard)
export class DiagnosisSupportController {
  constructor(private readonly service: DiagnosisSupportService) {}

  @Post('differentials')
  support(@Body() dto: ClinicalDiagnosisSupportDto, @Req() req: { user: { userId: string } }) {
    return this.service.support(dto.workspaceId, req.user.userId, dto);
  }
}