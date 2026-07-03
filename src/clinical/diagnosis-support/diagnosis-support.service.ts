import { Injectable, Optional } from '@nestjs/common';
import { AiCoreService } from '../../ai-core/ai-core.service';
import { AiRouterService } from '../../ai-core/ai-router.service';
import { WebhookEmitter } from '../../common/webhook.emitter';
import { QueueService } from '../../queue/queue.service';
import { ClinicalDiagnosisSupportDto } from './diagnosis-support.dto';

@Injectable()
export class DiagnosisSupportService {
  constructor(
    private readonly aiCore: AiCoreService,
    private readonly aiRouter: AiRouterService,
    @Optional() private readonly webhooks?: WebhookEmitter,
    @Optional() private readonly queue?: QueueService,
  ) {}

  async support(workspaceId: string, userId: string, dto: ClinicalDiagnosisSupportDto) {
    const primary = await this.aiCore.clinicalDiagnosis(workspaceId, userId, {
      symptoms: dto.symptoms,
      history: dto.history,
      signals: {
        species: dto.species ? 1 : 0,
        patientName: dto.patientName ? 1 : 0,
      },
    });

    const consensus = await this.aiRouter.consensus(
      `Provide differential diagnosis support only for symptoms: ${dto.symptoms.join(', ')}`,
      { domain: 'clinical' },
    );

    const payload = {
      workspaceId,
      patientName: dto.patientName ?? null,
      symptoms: dto.symptoms,
      status: (primary as { status?: string }).status ?? 'unknown',
    };
    this.webhooks?.emitCapabilityEvent('diagnosis', 'diagnosis.complete', payload);
    void this.queue?.addReport('diagnosis.auto-report', {
      ...payload,
      consensus: {
        agreed: consensus.agreed,
        agreementCount: consensus.agreementCount,
      },
    });

    return {
      ...primary,
      routerConsensus: {
        agreed: consensus.agreed,
        agreementCount: consensus.agreementCount,
        totalConsulted: consensus.totalConsulted,
      },
    };
  }
}