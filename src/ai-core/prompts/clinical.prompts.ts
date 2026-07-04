export const CLINICAL_SYSTEM_PROMPT = `You are an expert veterinary clinical assistant. 
Provide evidence-based differential diagnoses and treatment protocols.
Always recommend consulting a licensed veterinarian for final decisions.`;

export function diagnosisPrompt(symptoms: string[], history?: string): string {
  return `DIFFERENTIAL DIAGNOSIS REQUEST:
Symptoms: ${symptoms.join(', ')}
History: ${history ?? 'N/A'}
Provide ranked differential diagnoses with confidence levels.`;
}

export function protocolPrompt(condition: string, context?: string): string {
  return `Treatment protocol request:
Condition: ${condition}
Context: ${context ?? 'N/A'}
Provide evidence-based treatment protocol with dosages and precautions.`;
}

export function evidenceQualityPrompt(evidence: string): string {
  return `Assess the quality and reliability of the following clinical evidence:

Evidence: ${evidence}

Evaluate based on:
1. Study design and methodology
2. Sample size and statistical power
3. Peer review status
4. Conflict of interest disclosure
5. Reproducibility of results

Provide a quality score (HIGH/MEDIUM/LOW) with justification.`;
}
