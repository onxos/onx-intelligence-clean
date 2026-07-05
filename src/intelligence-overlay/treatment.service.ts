import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AiRouterService } from '../ai-core/ai-router.service';

export interface TreatmentInput {
  diagnosis: string;
  patientId: string;
  species: string;
  weight?: number;
  allergies?: string[];
  currentMedications?: string[];
}

export interface TreatmentResult {
  id: string;
  primaryProtocol: { name: string; description: string; duration: string };
  medications: { name: string; dosage: string; frequency: string; route: string; notes: string }[];
  lifestyleRecommendations: string[];
  followUpPlan: string;
  warnings: string[];
  alternatives: { name: string; reason: string }[];
}

@Injectable()
export class TreatmentService {
  constructor(private readonly prisma: PrismaService, private readonly aiRouter: AiRouterService) {}

  async recommend(input: TreatmentInput, workspaceId: string): Promise<TreatmentResult & { id: string }> {
    // Build evidence-based treatment prompt
    const prompt = this.buildTreatmentPrompt(input);

    // Route through AI with clinical context (placeholder in R1)
    const aiResponse = await this.aiRouter.route(prompt, { domain: 'clinical' });
    const parsed = this.parseAiJson(aiResponse.content);

    const result: TreatmentResult = {
      id: `treat_${Date.now()}`,
      primaryProtocol: parsed.primaryProtocol || { name: 'Standard Care', description: 'General supportive care', duration: '7-14 days' },
      medications: parsed.medications || [],
      lifestyleRecommendations: parsed.lifestyleRecommendations || [],
      followUpPlan: parsed.followUpPlan || 'Recheck in 7-14 days or sooner if condition worsens.',
      warnings: parsed.warnings || [],
      alternatives: parsed.alternatives || [],
    };

    // Store in IntelligenceObject
    await this.prisma.intelligenceObject.create({
      data: {
        type: 'TREATMENT',
        name: `AI Treatment: ${input.diagnosis}`,
        description: JSON.stringify(result),
        origin: 'AI_TREATMENT_SERVICE',
        workspaceId,
      } as any,
    });

    return { ...result, id: result.id };
  }

  async getProtocols(diagnosis: string, species: string) {
    // Return evidence-based protocols from stored intelligence
    return this.prisma.intelligenceObject.findMany({
      where: { type: 'TREATMENT' } as any,
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  private parseAiJson(content: string): any {
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private buildTreatmentPrompt(input: TreatmentInput): string {
    let prompt = `EVIDENCE-BASED TREATMENT PROTOCOL REQUEST:\n`;
    prompt += `Diagnosis: ${input.diagnosis}\n`;
    prompt += `Species: ${input.species}\n`;
    if (input.weight) prompt += `Weight: ${input.weight} kg\n`;
    if (input.allergies && input.allergies.length > 0) prompt += `Known Allergies: ${input.allergies.join(', ')}\n`;
    if (input.currentMedications && input.currentMedications.length > 0) prompt += `Current Medications: ${input.currentMedications.join(', ')}\n`;
    prompt += `\nProvide: primary treatment protocol with name, description, duration; medication list with dosage per weight, frequency, route, notes; lifestyle recommendations; follow-up plan; contraindications/warnings; alternative protocols. Format as JSON.`;
    return prompt;
  }
}
