import { DecisionLadderStage } from '@prisma/client';

/**
 * IW-27 — D14 Decision Ladder constants (HC-10).
 *
 * The 14-step ladder that transforms raw perception into an institutional rule
 * across 5 stages (PERCEPTION → UNDERSTANDING → JUDGMENT → LEARNING → GROWTH).
 */

export interface DecisionLadderStepDef {
  step: string;
  name: string;
  stage: DecisionLadderStage;
  /** Auto-progresses without human intervention (D1-D9). */
  auto: boolean;
}

export const DECISION_LADDER_STEPS: readonly DecisionLadderStepDef[] = [
  { step: 'D1', name: 'Sense', stage: 'PERCEPTION', auto: true },
  { step: 'D2', name: 'Observe', stage: 'PERCEPTION', auto: true },
  { step: 'D3', name: 'Collect', stage: 'PERCEPTION', auto: true },
  { step: 'D4', name: 'Capture', stage: 'PERCEPTION', auto: true },
  { step: 'D5', name: 'Classify', stage: 'UNDERSTANDING', auto: true },
  { step: 'D6', name: 'Contextualize', stage: 'UNDERSTANDING', auto: true },
  { step: 'D7', name: 'Interpret', stage: 'UNDERSTANDING', auto: true },
  { step: 'D8', name: 'Evaluate', stage: 'JUDGMENT', auto: true },
  { step: 'D9', name: 'Prioritize', stage: 'JUDGMENT', auto: true },
  { step: 'D10', name: 'Choose', stage: 'JUDGMENT', auto: false },
  { step: 'D11', name: 'Adapt', stage: 'LEARNING', auto: false },
  { step: 'D12', name: 'Validate', stage: 'LEARNING', auto: false },
  { step: 'D13', name: 'Iterate', stage: 'LEARNING', auto: false },
  { step: 'D14', name: 'Institutionalize', stage: 'GROWTH', auto: false },
] as const;

export const STEPS_BY_ID: ReadonlyMap<string, DecisionLadderStepDef> = new Map(
  DECISION_LADDER_STEPS.map((s) => [s.step, s]),
);

/** step -> the next step (D14 has no successor). */
export const NEXT_STEP: Record<string, string | null> = (() => {
  const map: Record<string, string | null> = {};
  DECISION_LADDER_STEPS.forEach((s, i) => {
    map[s.step] = DECISION_LADDER_STEPS[i + 1]?.step ?? null;
  });
  return map;
})();

export function stageForStep(step: string): DecisionLadderStage {
  return STEPS_BY_ID.get(step)?.stage ?? 'PERCEPTION';
}

export function stepName(step: string): string {
  return STEPS_BY_ID.get(step)?.name ?? step;
}

/** The last auto-progressing step reached during start() (D1-D9). */
export const LAST_AUTO_STEP = 'D9';

/** Judgment gate step where a Decision Gate (DG) may require human approval. */
export const CHOOSE_STEP = 'D10';

/** Growth step requiring DG-10 Founder approval to promote to an institutional rule. */
export const INSTITUTIONALIZE_STEP = 'D14';

/** FIC check step (SECH pre_decision) — D8 Evaluate. */
export const FIC_CHECK_STEP = 'D8';

/** OVR validation step (SECH post_outcome) — entering D14 from D13. */
export const OVR_VALIDATION_STEP = 'D14';

/**
 * Maximum D13→D14 iteration attempts before the run is paused for human review.
 * Prevents an infinite D12→D13→D14 validation loop (LADDER LOOP guard).
 */
export const MAX_ITERATIONS = 3;

/** DG-10 is the Founder gate that institutionalises a validated judgment. */
export const INSTITUTIONAL_GATE = 'DG-10';

export const DECISION_LADDER_STAGES: readonly DecisionLadderStage[] = [
  'PERCEPTION',
  'UNDERSTANDING',
  'JUDGMENT',
  'LEARNING',
  'GROWTH',
];
