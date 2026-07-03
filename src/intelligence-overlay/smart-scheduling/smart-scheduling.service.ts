import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AutoFillDto, OptimizeScheduleDto } from './smart-scheduling.dto';

type SchedulePrediction = {
  slotIndex: number;
  noShowProbability: number;
  suggestion: string;
};

@Injectable()
export class SmartSchedulingService {
  private readonly plans = new Map<string, Record<string, unknown>>();

  optimize(workspaceId: string, dto: OptimizeScheduleDto) {
    const predictions = dto.slots.map((slot, index) => {
      const historical = dto.historicalNoShows ?? [];
      const base = historical.length > 0 ? historical.reduce((sum, value) => sum + value, 0) / historical.length : 0.18;
      const noShowProbability = Math.min(0.95, base + index * 0.04);
      return {
        slotIndex: index,
        noShowProbability,
        suggestion: noShowProbability > 0.35 ? 'Consider waitlist backup' : 'Keep scheduled',
      } as SchedulePrediction;
    });

    const optimizedSlots = [...dto.slots].sort((left, right) => {
      const leftHasPatient = Boolean(left.patientId);
      const rightHasPatient = Boolean(right.patientId);
      if (leftHasPatient === rightHasPatient) {
        return left.start.localeCompare(right.start);
      }
      return leftHasPatient ? -1 : 1;
    });

    const plan = {
      id: randomUUID(),
      workspaceId,
      optimizedSlots,
      predictions,
      constraints: dto.constraints ?? null,
      createdAt: new Date().toISOString(),
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  predictions(workspaceId: string) {
    return [...this.plans.values()].filter((plan) => plan.workspaceId === workspaceId).flatMap((plan) => plan.predictions as SchedulePrediction[]);
  }

  autoFill(workspaceId: string, dto: AutoFillDto) {
    const emptySlots = dto.slots.filter((slot) => !slot.patientId);
    return {
      workspaceId,
      autoFilledCount: emptySlots.length,
      suggestions: emptySlots.map((slot) => ({
        slot: `${slot.start}-${slot.end}`,
        suggestedAction: 'Fill from waitlist',
      })),
    };
  }
}
