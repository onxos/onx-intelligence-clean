import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BuildSoapNoteDto } from './soap-intelligence.dto';

@Injectable()
export class SoapIntelligenceService {
  private readonly notes = new Map<string, Array<Record<string, unknown>>>();

  buildNote(workspaceId: string, dto: BuildSoapNoteDto) {
    const transcript = dto.voiceTranscript?.trim();
    const note = {
      id: randomUUID(),
      workspaceId,
      patientId: dto.patientId ?? null,
      template: 'SOAP',
      createdAt: new Date().toISOString(),
      note: {
        subjective: dto.subject?.trim() || transcript || 'Patient conversation not provided.',
        objective: dto.objective?.trim() || 'Objective findings pending.',
        assessment: dto.assessment?.trim() || 'Assessment pending clinician review.',
        plan: dto.plan?.trim() || 'Plan pending clinician confirmation.',
      },
      tags: dto.tags ?? [],
      transcriptSummary: transcript ? transcript.split(/\s+/).slice(0, 24).join(' ') : null,
    };

    if (dto.patientId) {
      const bucket = this.notes.get(dto.patientId) ?? [];
      bucket.unshift(note);
      this.notes.set(dto.patientId, bucket.slice(0, 50));
    }

    return note;
  }

  list(patientId?: string) {
    if (!patientId) {
      return [];
    }
    return this.notes.get(patientId) ?? [];
  }
}