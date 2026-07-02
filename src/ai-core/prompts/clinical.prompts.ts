/**
 * Phase 1 — AI Integration Core: clinical prompt templates.
 *
 * Constitutional guardrail HC-02: the AI provides DECISION SUPPORT only. It
 * proposes DIFFERENTIAL diagnoses and evidence-based options — never a final,
 * binding diagnosis. Every clinical prompt embeds this framing and an AC-05
 * evidence-tiering instruction so downstream governance can classify the
 * response.
 */

export const CLINICAL_SYSTEM_PROMPT = [
  'You are a veterinary clinical decision-support assistant operating inside the',
  'ONX Intelligence constitutional system.',
  'HC-02: You MUST NOT issue a final or binding diagnosis. You provide a ranked',
  'DIFFERENTIAL and evidence-based options only; a licensed clinician makes the',
  'final decision.',
  'Always state uncertainty, cite the class of evidence, and flag red-flag',
  'findings that require immediate clinician review.',
].join(' ');

/** Build a differential-diagnosis support prompt (never a final diagnosis). */
export function diagnosisPrompt(symptoms: string[], history?: string): string {
  const symptomList = symptoms.map((s) => `- ${s.trim()}`).join('\n');
  return [
    'Provide DIFFERENTIAL diagnosis support (HC-02: not a final diagnosis).',
    '',
    'Presenting signs:',
    symptomList || '- (none provided)',
    '',
    `Relevant history: ${history?.trim() || 'not provided'}`,
    '',
    'Respond with:',
    '1. Ranked differential (most to least likely) with a confidence band.',
    '2. Discriminating tests/observations that would narrow the differential.',
    '3. Red-flag findings requiring immediate clinician escalation.',
    '4. An explicit statement that a licensed clinician must confirm the diagnosis.',
  ].join('\n');
}

/** Build an evidence-based protocol suggestion prompt. */
export function protocolPrompt(condition: string, context?: string): string {
  return [
    'Suggest an EVIDENCE-BASED protocol (decision support, not a directive).',
    '',
    `Condition: ${condition.trim()}`,
    `Context: ${context?.trim() || 'not provided'}`,
    '',
    'Respond with:',
    '1. Recommended protocol steps with the evidence class supporting each.',
    '2. Contraindications and monitoring requirements.',
    '3. Alternatives when first-line options are unavailable.',
    '4. A note that the attending clinician retains final authority.',
  ].join('\n');
}

/** Build an AC-05 evidence-quality classification prompt. */
export function evidenceQualityPrompt(claim: string, sources: string[]): string {
  const sourceList = sources.map((s, i) => `${i + 1}. ${s.trim()}`).join('\n');
  return [
    'Classify the evidence quality of the following claim using the AC-05',
    'hierarchy (tier 1 = first-party institutional systems, tier 2 = founder,',
    'tier 3 = consulting/expert, tier 4 = general AI).',
    '',
    `Claim: ${claim.trim()}`,
    '',
    'Sources:',
    sourceList || '(none provided)',
    '',
    'Respond with the assigned AC-05 tier, the rationale, and any evidence gaps.',
  ].join('\n');
}
