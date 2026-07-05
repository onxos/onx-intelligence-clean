import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AiRouterService } from '../ai-core/ai-router.service';

export interface SoapNote {
  id: string;
  subjective: string;   // Chief complaint, history, symptoms
  objective: string;    // Physical exam findings, vitals, lab results
  assessment: string;   // Diagnosis / differential
  plan: string;         // Treatment, medications, follow-up
  rawTranscript: string;
  veterinarianId: string;
  patientId?: string;
  appointmentId?: string;
  workspaceId: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CORRECTED';
  createdAt: Date;
}

@Injectable()
export class VoiceSoapService {
  constructor(private readonly prisma: PrismaService, private readonly aiRouter: AiRouterService) {}

  async convert(transcript: string, veterinarianId: string, workspaceId: string, patientId?: string, appointmentId?: string): Promise<SoapNote> {
    // Build structured SOAP from free-text transcript using AI (placeholder in R1)
    const prompt = this.buildSoapPrompt(transcript);
    const aiResponse = await this.aiRouter.route(prompt, { domain: 'clinical' });
    const parsed = this.parseAiJson(aiResponse.content);

    const soapNote: SoapNote = {
      id: `soap_${Date.now()}`,
      subjective: parsed.subjective || '',
      objective: parsed.objective || '',
      assessment: parsed.assessment || '',
      plan: parsed.plan || '',
      rawTranscript: transcript,
      veterinarianId,
      patientId,
      appointmentId,
      workspaceId,
      status: 'DRAFT',
      createdAt: new Date(),
    };

    // Store as IntelligenceObject
    await this.prisma.intelligenceObject.create({
      data: {
        type: 'SOAP_NOTE',
        name: `SOAP: ${soapNote.subjective.substring(0, 50)}...`,
        description: JSON.stringify(soapNote),
        origin: 'AI_VOICE_TO_SOAP',
        workspaceId,
      } as any,
    });

    return soapNote;
  }

  async confirm(recordId: string, workspaceId: string, confirmed: boolean, correctedBy?: string): Promise<SoapNote> {
    const obj = await this.prisma.intelligenceObject.findFirst({
      where: { id: recordId, workspaceId, type: 'SOAP_NOTE' } as any,
    });
    if (!obj) throw new NotFoundException('SOAP note not found');

    const soapNote: SoapNote = JSON.parse(obj.content);
    soapNote.status = confirmed ? 'CONFIRMED' : 'CORRECTED';

    // If confirmed, optionally create a formal MedicalRecord
    if (confirmed && soapNote.patientId) {
      await this.prisma.medicalRecord.create({
        data: {
          patientId: soapNote.patientId,
          visitType: 'ROUTINE',
          chiefComplaint: soapNote.subjective.substring(0, 200),
          diagnosis: soapNote.assessment,
          treatmentPlan: soapNote.plan,
          veterinarianId: correctedBy || soapNote.veterinarianId,
          notes: `Generated from voice-to-SOAP. Raw transcript: ${soapNote.rawTranscript.substring(0, 500)}`,
          workspaceId,
        },
      });
    }

    // Update stored version
    await this.prisma.intelligenceObject.update({
      where: { id: recordId },
      data: { content: JSON.stringify(soapNote) },
    });

    return soapNote;
  }

  private parseAiJson(content: string): any {
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private buildSoapPrompt(transcript: string): string {
    return `CONVERT VETERINARY CONVERSATION TO STRUCTURED SOAP NOTE:\n\nTranscript: "${transcript}"\n\nExtract and format as JSON with fields: subjective (chief complaint, history, symptoms reported), objective (physical exam findings, vitals if mentioned, lab results if mentioned), assessment (primary diagnosis and differentials), plan (treatment recommendations, medications, follow-up instructions). Be thorough and clinical in tone.`;
  }
}
