/**
 * IW-26 — USFIP Unified Perception Bus constants (HC-12 + AC-05).
 *
 * The perception bus is the single entry gate for every data source. This file
 * carries the source/domain/tier vocabulary and the AC-05 evidence-quality
 * hierarchy used by the 5-step pipeline (validate → classify → rank → FIC check
 * → route).
 *
 * NOTE: This "USFIP" (Unified Source Fusion & Integration Protocol / Perception
 * Bus) is a different protocol from the IW-14 USFIP (Universal Strategic Founder
 * Intelligence Protocol). They are intentionally isolated: this lives in
 * src/perception/, IW-14 lives in src/usfip/.
 */

/** Accepted perception source types. */
export const PERCEPTION_SOURCE_TYPES = [
  'whatsapp',
  'emr',
  'crm',
  'pos',
  'sensor',
  'manual',
] as const;
export type PerceptionSourceType = (typeof PERCEPTION_SOURCE_TYPES)[number];

/** Classifiable business domains. */
export const PERCEPTION_DOMAINS = [
  'clinical',
  'commercial',
  'operational',
  'strategic',
  'people',
  'customer',
] as const;
export type PerceptionDomain = (typeof PERCEPTION_DOMAINS)[number];

/** Default domain classification per source type (used when none is proposed). */
export const SOURCE_DEFAULT_DOMAIN: Record<PerceptionSourceType, PerceptionDomain> = {
  emr: 'clinical',
  crm: 'customer',
  pos: 'commercial',
  whatsapp: 'customer',
  sensor: 'operational',
  manual: 'operational',
};

/** AC-05 evidence-quality tiers (1 = highest authority). */
export interface EvidenceTierDef {
  tier: 1 | 2 | 3 | 4;
  label: string;
  weight: number;
}

export const EVIDENCE_TIERS: Record<1 | 2 | 3 | 4, EvidenceTierDef> = {
  1: { tier: 1, label: 'Elite Vet operational data (EMR, CRM, POS, sensor)', weight: 1.0 },
  2: { tier: 2, label: 'Founder direct observation / input', weight: 0.95 },
  3: { tier: 3, label: 'Consulting framework / external expert', weight: 0.75 },
  4: { tier: 4, label: 'General AI knowledge / web search', weight: 0.5 },
};

/** Default evidence tier per source type per AC-05. */
export const SOURCE_DEFAULT_TIER: Record<PerceptionSourceType, 1 | 2 | 3 | 4> = {
  emr: 1,
  crm: 1,
  pos: 1,
  sensor: 1,
  manual: 2, // founder/staff direct input defaults to founder-observation tier
  whatsapp: 3, // unverified inbound message — treat as external until corroborated
};

export function tierWeight(tier: number): number {
  return EVIDENCE_TIERS[tier as 1 | 2 | 3 | 4]?.weight ?? 0;
}

export function isValidTier(tier: number): tier is 1 | 2 | 3 | 4 {
  return tier === 1 || tier === 2 || tier === 3 || tier === 4;
}

/** Tiers considered "higher authority" for AC-05 conflict rejection. */
export const HIGHER_AUTHORITY_TIERS = [1, 2] as const;

/** Terminal perception statuses. */
export const PERCEPTION_STATUSES = ['pending', 'approved', 'rejected', 'flagged'] as const;
export type PerceptionStatus = (typeof PERCEPTION_STATUSES)[number];

/** The 5 pipeline steps (documentation / trace labels). */
export const USFIP_PIPELINE_STEPS = [
  {
    step: 1,
    name: 'VALIDATE',
    description: 'Check data format, completeness, source authentication.',
  },
  { step: 2, name: 'CLASSIFY', description: 'Assign to a business domain.' },
  { step: 3, name: 'RANK', description: 'Apply the AC-05 evidence-quality hierarchy.' },
  { step: 4, name: 'FIC_CHECK', description: 'Run through the SECH pre_judgment gate.' },
  { step: 5, name: 'ROUTE', description: 'Write to IURG with the resulting edges.' },
] as const;
