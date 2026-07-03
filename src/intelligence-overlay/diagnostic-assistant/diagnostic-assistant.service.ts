import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiCoreService } from '../../ai-core/ai-core.service';
import { DiagnoseDto, DiagnosisFeedbackDto } from './diagnostic-assistant.dto';

type DiagnosisRecord = {
  id: string;
  workspaceId: string;
  patientId?: string;
  symptoms: string[];
  patientHistory?: string;
  labResults: string[];
  rankedDifferentials: Array<{ condition: string; confidence: number; reason: string }>;
  recommendedTests: string[];
  aiResponse: string;
  feedback: Array<{ verdict: string; notes?: string; createdAt: string }>;
  createdAt: string;
};

@Injectable()
export class DiagnosticAssistantService {
  private readonly diagnoses = new Map<string, DiagnosisRecord>();

  constructor(@Optional() private readonly aiCore?: AiCoreService) {}

  async diagnose(workspaceId: string, userId: string, dto: DiagnoseDto) {
    const prompt = [
      'Return a ranked veterinary differential diagnosis with recommended tests.',
      `Symptoms: ${dto.symptoms.join(', ')}`,
      dto.patientHistory ? `History: ${dto.patientHistory}` : '',
      dto.labResults?.length ? `Lab results: ${dto.labResults.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const response = this.aiCore
      ? await this.aiCore.clinicalDiagnosis(workspaceId, userId, {
          symptoms: dto.symptoms,
          history: [dto.patientHistory, dto.labResults?.join('; ')].filter(Boolean).join(' | '),
        })
      : {
          status: 'approved' as const,
          response: prompt,
        };

    const rankedDifferentials = rankDifferentials(dto.symptoms, dto.labResults ?? []);
    const record: DiagnosisRecord = {
      id: randomUUID(),
      workspaceId,
      patientId: dto.patientId,
      symptoms: dto.symptoms,
      patientHistory: dto.patientHistory,
      labResults: dto.labResults ?? [],
      rankedDifferentials,
      recommendedTests: rankedDifferentials.slice(0, 3).flatMap((item) => testsForCondition(item.condition)),
      aiResponse: typeof response.response === 'string' ? response.response : prompt,
      feedback: [],
      createdAt: new Date().toISOString(),
    };
    this.diagnoses.set(record.id, record);
    return record;
  }

  getById(workspaceId: string, id: string) {
    const record = this.diagnoses.get(id);
    if (!record || record.workspaceId !== workspaceId) {
      throw new NotFoundException(`Diagnosis result not found: ${id}`);
    }
    return record;
  }

  feedback(workspaceId: string, id: string, dto: DiagnosisFeedbackDto) {
    const record = this.getById(workspaceId, id);
    record.feedback.push({ verdict: dto.verdict, notes: dto.notes, createdAt: new Date().toISOString() });
    return record;
  }
}

function rankDifferentials(symptoms: string[], labResults: string[]) {
  const text = [...symptoms, ...labResults].join(' ').toLowerCase();
  const candidates = [
    { condition: 'Inflammatory disease', keywords: ['fever', 'pain', 'swelling', 'inflammation'] },
    { condition: 'Gastrointestinal disorder', keywords: ['vomit', 'diarrhea', 'nausea', 'abdominal'] },
    { condition: 'Respiratory disease', keywords: ['cough', 'dyspnea', 'wheeze', 'respiratory'] },
    { condition: 'Endocrine disorder', keywords: ['weight loss', 'polyuria', 'polydipsia', 't4'] },
    { condition: 'Trauma / orthopedic injury', keywords: ['lameness', 'fracture', 'limb', 'injury'] },
  ];

  return candidates
    .map((candidate) => {
      const hits = candidate.keywords.filter((keyword) => text.includes(keyword)).length;
      return {
        condition: candidate.condition,
        confidence: Math.min(0.95, 0.35 + hits * 0.18),
        reason: hits > 0 ? `Matched ${hits} symptom keywords` : 'General differential based on presentation',
      };
    })
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);
}

function testsForCondition(condition: string) {
  switch (condition) {
    case 'Inflammatory disease':
      return ['CBC', 'Chemistry Panel', 'CRP'];
    case 'Gastrointestinal disorder':
      return ['Fecal exam', 'Abdominal imaging'];
    case 'Respiratory disease':
      return ['Thoracic radiographs', 'Pulse oximetry'];
    case 'Endocrine disorder':
      return ['Hormone panel', 'Urinalysis'];
    case 'Trauma / orthopedic injury':
      return ['Orthopedic radiographs', 'Pain assessment'];
    default:
      return ['CBC'];
  }
}
