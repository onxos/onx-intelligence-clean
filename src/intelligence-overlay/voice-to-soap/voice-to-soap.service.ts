import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiCoreService } from '../../ai-core/ai-core.service';
import { VoiceStreamDto, VoiceToSoapDto } from './voice-to-soap.dto';

type SoapNote = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

type VoiceSoapSession = {
  id: string;
  workspaceId: string;
  source: 'upload' | 'stream';
  format?: string;
  transcript: string;
  soap: SoapNote;
  createdAt: string;
};

@Injectable()
export class VoiceToSoapService {
  private readonly sessions = new Map<string, VoiceSoapSession>();

  constructor(private readonly aiCore: AiCoreService) {}

  async convert(workspaceId: string, userId: string, dto: VoiceToSoapDto) {
    const transcript = dto.transcriptHint?.trim() || synthesizeTranscript(dto.audioBase64, dto.format);
    const ai = await this.aiCore.query(workspaceId, userId, {
      query: `Convert this clinical transcript into SOAP format:\n${transcript}`,
      domain: 'clinical',
      context: { system: 'Return only SOAP note structure' },
    });
    const aiSummary = 'counterProposal' in ai ? ai.counterProposal : ai.response;
    const soap = buildSoap(transcript, aiSummary);
    const record: VoiceSoapSession = {
      id: randomUUID(),
      workspaceId,
      source: 'upload',
      format: dto.format,
      transcript,
      soap,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(record.id, record);
    return { ...record, ai };
  }

  async stream(workspaceId: string, userId: string, dto: VoiceStreamDto) {
    const transcript = dto.chunks.join(' ').trim();
    return this.convert(workspaceId, userId, {
      audioBase64: Buffer.from(transcript).toString('base64'),
      format: dto.format,
      transcriptHint: transcript,
    });
  }

  templates() {
    return [
      { id: 'standard-soap', name: 'Standard SOAP', sections: ['Subjective', 'Objective', 'Assessment', 'Plan'] },
      { id: 'emergency-soap', name: 'Emergency SOAP', sections: ['Triage', 'Objective', 'Assessment', 'Plan'] },
      { id: 'surgical-soap', name: 'Surgical SOAP', sections: ['Subjective', 'Pre-op Objective', 'Assessment', 'Plan'] },
    ];
  }
}

function synthesizeTranscript(audioBase64: string, format?: string) {
  const length = Math.max(0, Math.floor(audioBase64.length / 12));
  return `Audio transcript (${format ?? 'unknown'}) extracted from ${length} chunks. Clinical follow-up required.`;
}

function buildSoap(transcript: string, aiSummary?: string): SoapNote {
  return {
    subjective: transcript,
    objective: aiSummary ? `AI summary: ${aiSummary}` : 'Objective findings pending.',
    assessment: 'Assessment pending clinician confirmation.',
    plan: 'Plan pending clinician review.',
  };
}
