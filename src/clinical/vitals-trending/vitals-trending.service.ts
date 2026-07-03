import { Injectable, Optional } from '@nestjs/common';
import { AlertingService } from '../../alerting/alerting.service';
import { WebhookEmitter } from '../../common/webhook.emitter';
import { QueueService } from '../../queue/queue.service';
import { AnalyzeVitalsDto } from './vitals-trending.dto';

@Injectable()
export class VitalsTrendingService {
  private readonly history = new Map<string, Array<Record<string, unknown>>>();

  constructor(
    @Optional() private readonly alerting?: AlertingService,
    @Optional() private readonly webhooks?: WebhookEmitter,
    @Optional() private readonly queue?: QueueService,
  ) {}

  analyze(workspaceId: string, dto: AnalyzeVitalsDto) {
    const groups = new Map<string, number[]>();
    for (const reading of dto.readings) {
      const bucket = groups.get(reading.kind) ?? [];
      bucket.push(reading.value);
      groups.set(reading.kind, bucket);
    }

    const trends = [...groups.entries()].map(([kind, values]) => {
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const latest = values[values.length - 1] ?? 0;
      const first = values[0] ?? 0;
      const change = first === 0 ? latest - first : (latest - first) / first;
      return {
        kind,
        count: values.length,
        average,
        latest,
        change,
        anomaly: Math.abs(change) >= 0.25 || latest >= average * 1.4 || latest <= average * 0.6,
      };
    });

    const result = {
      workspaceId,
      patientId: dto.patientId,
      trends,
      alerts: trends.filter((trend) => trend.anomaly).map((trend) => trend.kind),
    };

    const bucket = this.history.get(dto.patientId) ?? [];
    bucket.unshift({ ...result, createdAt: new Date().toISOString() });
    this.history.set(dto.patientId, bucket.slice(0, 100));

    if (result.alerts.length > 0) {
      const payload = {
        workspaceId,
        patientId: dto.patientId,
        alerts: result.alerts,
      };
      this.webhooks?.emitCapabilityEvent('vitals', 'vitals.alert', payload);
      void this.queue?.addNotify('vitals.alert', payload);
      void this.alerting?.onViolation({
        constraintId: 'CLINICAL_VITAL_ALERT',
        action: 'vitals.alert',
        workspaceId,
        severity: 'CRITICAL',
      });
    }

    return result;
  }

  list(patientId: string) {
    return this.history.get(patientId) ?? [];
  }
}