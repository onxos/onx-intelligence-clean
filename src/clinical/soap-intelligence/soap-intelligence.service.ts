import { Injectable } from '@nestjs/common';
import { BuildSoapNoteDto } from './soap-intelligence.dto';

@Injectable()
export class SoapIntelligenceService {
  buildNote(dto: BuildSoapNoteDto) {
    const transcript = dto.voiceTranscript?.trim();
    return {
      workspaceId: dto.workspaceId,
      patientId: dto.patientId ?? null,
      template: 'SOAP',
      note: {
        subjective: dto.subject?.trim() || transcript || 'Patient conversation not provided.',
        objective: dto.objective?.trim() || 'Objective findings pending.',
        assessment: dto.assessment?.trim() || 'Assessment pending clinician review.',
        plan: dto.plan?.trim() || 'Plan pending clinician confirmation.',
      },
      tags: dto.tags ?? [],
      transcriptSummary: transcript ? transcript.split(/\s+/).slice(0, 24).join(' ') : null,
    };
  }
}