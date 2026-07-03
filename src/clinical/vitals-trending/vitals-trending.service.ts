import { Injectable } from '@nestjs/common';
import { AnalyzeVitalsDto } from './vitals-trending.dto';

@Injectable()
export class VitalsTrendingService {
  analyze(dto: AnalyzeVitalsDto) {
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

    return {
      workspaceId: dto.workspaceId,
      patientId: dto.patientId,
      trends,
      alerts: trends.filter((trend) => trend.anomaly).map((trend) => trend.kind),
    };
  }
}