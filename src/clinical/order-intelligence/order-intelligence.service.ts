import { Injectable } from '@nestjs/common';
import { ClinicalOrderRecommendationDto } from './order-intelligence.dto';

@Injectable()
export class OrderIntelligenceService {
  recommend(dto: ClinicalOrderRecommendationDto) {
    const symptoms = dto.symptoms ?? [];
    const shouldImage = symptoms.some((symptom) => /pain|lameness|limb|x-ray|fracture|injury/i.test(symptom));
    const shouldLab = symptoms.some((symptom) => /fever|vomit|diarrhea|infection|anemia/i.test(symptom));
    const shouldMedication = (dto.currentMedications ?? []).length > 0;
    const complaint = dto.chiefComplaint ?? symptoms.join(', ');

    return {
      workspaceId: dto.workspaceId,
      patientId: dto.patientId,
      routing: {
        lab: shouldLab ? ['CBC', 'Chemistry Panel'] : [],
        imaging: shouldImage ? ['X-Ray', 'Ultrasound'] : [],
        medication: shouldMedication ? ['Medication reconciliation required'] : [],
      },
      urgency: shouldLab || shouldImage ? 'priority' : 'routine',
      rationale: complaint || 'No complaint provided',
    };
  }
}