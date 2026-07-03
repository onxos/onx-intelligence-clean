import { Injectable } from '@nestjs/common';
import { AiCoreService } from '../../ai-core/ai-core.service';
import { InteractionVerificationDto, TreatmentRecommendationDto } from './treatment-recommender.dto';

@Injectable()
export class TreatmentRecommenderService {
  constructor(private readonly aiCore: AiCoreService) {}

  async recommend(workspaceId: string, userId: string, dto: TreatmentRecommendationDto) {
    const prompt = [
      `Create an evidence-based treatment protocol for ${dto.species}.`,
      `Diagnosis: ${dto.diagnosis}`,
      `Weight: ${dto.weightKg} kg`,
      `Age: ${dto.ageYears} years`,
      dto.allergies?.length ? `Allergies: ${dto.allergies.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const ai = await this.aiCore.clinicalProtocol(workspaceId, userId, {
      condition: dto.diagnosis,
      context: prompt,
    });
    const protocolSummary = 'counterProposal' in ai ? ai.counterProposal : ai.response;

    return {
      diagnosis: dto.diagnosis,
      species: dto.species,
      weightKg: dto.weightKg,
      ageYears: dto.ageYears,
      allergies: dto.allergies ?? [],
      protocolSummary,
      treatmentOptions: buildTreatmentOptions(dto),
      contraindications: buildContraindications(dto),
      ai,
    };
  }

  protocols() {
    return [
      { id: 'standard-canine-uti', title: 'Standard Canine UTI Protocol', category: 'urinary' },
      { id: 'feline-dermatology', title: 'Feline Dermatology Protocol', category: 'dermatology' },
      { id: 'emergency-stabilization', title: 'Emergency Stabilization', category: 'critical-care' },
    ];
  }

  verify(dto: InteractionVerificationDto) {
    const meds = dto.medications.map((item) => item.toLowerCase());
    const warnings: string[] = [];

    if (meds.some((item) => ['meloxicam', 'carprofen', 'prednisone', 'dexamethasone'].includes(item))) {
      warnings.push('NSAID and steroid combination should be reviewed carefully.');
    }
    if (meds.includes('enalapril') && meds.includes('carprofen')) {
      warnings.push('Monitor renal function when combining ACE inhibitors and NSAIDs.');
    }

    return {
      medications: dto.medications,
      warnings,
      safe: warnings.length === 0,
    };
  }
}

function buildTreatmentOptions(dto: TreatmentRecommendationDto) {
  const base = [
    { name: 'Supportive care', dosage: 'Per clinician judgment', notes: 'Hydration, rest, monitoring' },
    { name: 'Analgesia', dosage: `${Math.max(0.1, Math.min(0.5, dto.weightKg * 0.01)).toFixed(2)} mg/kg`, notes: 'Adjust per contraindications' },
  ];
  if (/infection|fever|uti|pyometra/i.test(dto.diagnosis)) {
    base.push({ name: 'Antimicrobial protocol', dosage: 'Protocol-dependent', notes: 'Select based on culture/sensitivity' });
  }
  return base;
}

function buildContraindications(dto: TreatmentRecommendationDto) {
  const contraindications: string[] = [];
  if (dto.allergies?.some((allergy) => /penicillin|sulfa/i.test(allergy))) {
    contraindications.push('Avoid penicillin/sulfonamide classes when applicable.');
  }
  if (dto.weightKg < 2) {
    contraindications.push('Small-patient dosing requires extra verification.');
  }
  return contraindications;
}
