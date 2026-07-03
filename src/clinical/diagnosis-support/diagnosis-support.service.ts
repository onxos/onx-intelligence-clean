import { Injectable } from '@nestjs/common';
import { AiCoreService } from '../../ai-core/ai-core.service';
import { ClinicalDiagnosisSupportDto } from './diagnosis-support.dto';

@Injectable()
export class DiagnosisSupportService {
  constructor(private readonly aiCore: AiCoreService) {}

  async support(workspaceId: string, userId: string, dto: ClinicalDiagnosisSupportDto) {
    return this.aiCore.clinicalDiagnosis(workspaceId, userId, {
      symptoms: dto.symptoms,
      history: dto.history,
      signals: {
        species: dto.species ? 1 : 0,
        patientName: dto.patientName ? 1 : 0,
      },
    });
  }
}