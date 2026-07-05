import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AiRouterService } from '../ai-core/ai-router.service';

export interface DiagnosisInput {
  symptoms: string[];
  species: string;
  breed?: string;
  age?: number;
  weight?: number;
  gender?: string;
  labResults?: any[];
}

export interface DiagnosisResult {
  id: string;
  primaryDiagnosis: string;
  confidence: number;
  differentialDiagnoses: { name: string; confidence: number; reasoning: string }[];
  recommendedTests: string[];
  redFlags: string[];
  veterinarianNote: string;
}

@Injectable()
export class DiagnosticService {
  constructor(private readonly prisma: PrismaService, private readonly aiRouter: AiRouterService) {}

  async analyze(input: DiagnosisInput, workspaceId: string): Promise<DiagnosisResult & { id: string }> {
    // Build prompt for AI
    const prompt = this.buildDiagnosticPrompt(input);

    // Route through AI (placeholder in R1; will return real structured JSON once Phase R3 AI providers are wired)
    const aiResponse = await this.aiRouter.route(prompt, { domain: 'clinical' });
    const parsed = this.parseAiJson(aiResponse.content);

    // Parse and structure result
    const result: DiagnosisResult = {
      id: `diag_${Date.now()}`,
      primaryDiagnosis: parsed.primaryDiagnosis || 'Unable to determine',
      confidence: parsed.confidence || 0,
      differentialDiagnoses: parsed.differentialDiagnoses || [],
      recommendedTests: parsed.recommendedTests || [],
      redFlags: parsed.redFlags || [],
      veterinarianNote: `AI-assisted diagnosis for ${input.species}. Final diagnosis requires veterinarian verification.`,
    };

    // Store in IntelligenceObject for record
    await this.prisma.intelligenceObject.create({
      data: {
        type: 'DIAGNOSIS',
        name: `AI Diagnosis: ${result.primaryDiagnosis}`,
        description: JSON.stringify(result),
        origin: 'AI_DIAGNOSTIC_SERVICE',
        confidence: result.confidence,
        workspaceId,
      } as any,
    });

    return { ...result, id: result.id };
  }

  async getHistory(patientId: string, workspaceId: string) {
    return this.prisma.intelligenceObject.findMany({
      where: { workspaceId, type: 'DIAGNOSIS' } as any,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  private parseAiJson(content: string): any {
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private buildDiagnosticPrompt(input: DiagnosisInput): string {
    let prompt = `VETERINARY DIFFERENTIAL DIAGNOSIS REQUEST:\n`;
    prompt += `Species: ${input.species}\n`;
    if (input.breed) prompt += `Breed: ${input.breed}\n`;
    if (input.age) prompt += `Age: ${input.age} years\n`;
    if (input.weight) prompt += `Weight: ${input.weight} kg\n`;
    if (input.gender) prompt += `Gender: ${input.gender}\n`;
    prompt += `Symptoms: ${input.symptoms.join(', ')}\n`;
    if (input.labResults && input.labResults.length > 0) {
      prompt += `Lab Results:\n`;
      input.labResults.forEach(lr => { prompt += `- ${lr.testName}: ${lr.value} ${lr.unit} (ref: ${lr.referenceRange})\n`; });
    }
    prompt += `\nProvide: primary diagnosis, confidence (0-1), top 3 differential diagnoses with reasoning, recommended confirmatory tests, and any red flags requiring immediate attention. Format as JSON.`;
    return prompt;
  }
}
