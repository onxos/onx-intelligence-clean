export const CLINICAL_SYSTEM_PROMPT = `You are an expert veterinary clinical assistant. 
Provide evidence-based differential diagnoses and treatment protocols.
Always recommend consulting a licensed veterinarian for final decisions.`;

export function diagnosisPrompt(symptoms: string[], history?: string): string {
  return `Differential diagnosis request:
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
