/**
 * FIC Full Runtime Enforcement — Constitutional Content Package (CCP)
 * ------------------------------------------------------------------
 * IW-23. Compiled from FIC v0.1 + FIC v0.2 (ICE-02).
 *
 * This module is the canonical, code-versioned constitutional registry that
 * the SECH-FIC runtime enforcement engine evaluates against. It contains:
 *   - 38 canonical Founder Intent corpus objects
 *   - 68 executable constraints (12 HC, 12 SC, 6 AC, 12 DG, 12 EB, 10 OVR, 5 OR)
 *   - 7 Conflict Resolution Classes
 *   - the 8-level Priority Hierarchy
 *   - 10 Playbook constraint mappings
 *   - the 13-step SECH-FIC check sequence
 *
 * The registry lives in code (not the DB) because it is a constitutional
 * axiom set: immutable at runtime, versioned through source control, and
 * referenced by value. Runtime *enforcement results* (checks / evaluations /
 * violations) are persisted (see fic-enforcement.service.ts + Prisma models).
 *
 * The existing intent lifecycle (create / version / review / conflict /
 * override) already lives in intent-compiler.service.ts and is NOT duplicated
 * here — this file adds only the runtime enforcement corpus.
 */

// ---------------------------------------------------------------------------
// Kinds & shared unions
// ---------------------------------------------------------------------------

/** Constraint families in the executable constraint system. */
export type FicConstraintKind = 'HC' | 'SC' | 'AC' | 'EB' | 'DG' | 'OVR' | 'OR';

/** Per-constraint evaluation outcome produced by the engine. */
export type FicEvaluationOutcome =
  | 'PASS'
  | 'VIOLATED'
  | 'FLAGGED'
  | 'GATE_REQUIRED'
  | 'BLOCKED'
  | 'ADVISORY'
  | 'NOT_APPLICABLE';

/** Terminal decision returned by the SECH-FIC check. */
export type FicCheckDecision = 'APPROVED' | 'REJECTED' | 'CONFLICT' | 'OVERRIDE';

/** Intent categories used by the canonical corpus. */
export type FicIntentCategory =
  | 'principle'
  | 'decision'
  | 'tradeoff'
  | 'failure'
  | 'success'
  | 'exception'
  | 'crisis'
  | 'growth'
  | 'mercy'
  | 'reputation'
  | 'commercial'
  | 'medical'
  | 'people'
  | 'expansion'
  | 'non_negotiable';

// ---------------------------------------------------------------------------
// Section 1 — Founder Intent Corpus (38 canonical objects)
// ---------------------------------------------------------------------------

export interface FounderIntentCorpusObject {
  intentId: string;
  statement: string;
  category: FicIntentCategory;
  constraintTypeCandidate: FicConstraintKind;
  affectedDomains: string[];
  relatedConstraints: string[];
  relatedPlaybooks: string[];
}

export const FOUNDER_INTENT_CORPUS: readonly FounderIntentCorpusObject[] = [
  {
    intentId: 'FI-2026-0001',
    statement:
      'No profit at the expense of care, trust, or mercy. Animal welfare is the non-negotiable first priority.',
    category: 'principle',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['clinical', 'commercial', 'operational', 'people'],
    relatedConstraints: ['HC-08', 'EB-02', 'EB-03', 'OVR-01'],
    relatedPlaybooks: [
      'clinic_operations',
      'medical_quality',
      'commercial_growth',
      'crisis_response',
    ],
  },
  {
    intentId: 'FI-2026-0002',
    statement:
      'No major decision without evidence, context, and governance. Everything presented as operational truth must be proven and classified by reality tier.',
    category: 'principle',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['clinical', 'commercial', 'operational', 'strategic'],
    relatedConstraints: ['HC-03', 'DG-01', 'DG-03', 'OVR-08', 'OVR-10'],
    relatedPlaybooks: [
      'clinic_operations',
      'revenue_optimization',
      'branch_expansion',
      'crisis_response',
    ],
  },
  {
    intentId: 'FI-2026-0003',
    statement:
      'No knowledge is lost. Every experience becomes institutional learning. Understanding is append-only: revision, supersession, and audit — but never overwrite or delete.',
    category: 'principle',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['operational', 'strategic'],
    relatedConstraints: ['HC-04', 'EB-08', 'OVR-06'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0004',
    statement:
      'Founder Intent is the highest executable constraint. At any conflict between Founder Intent and data, evidence, or optimization, Founder Intent prevails — unless a formal Constitutional Review Process is triggered and completed.',
    category: 'principle',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['all'],
    relatedConstraints: ['HC-08', 'OR-02', 'OR-03', 'OR-04'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0005',
    statement:
      'The three irreversible discoveries must be preserved in every component: Knowledge != Judgment, Perception != Understanding, Learning != Growth.',
    category: 'principle',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['all'],
    relatedConstraints: ['HC-10'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0006',
    statement:
      'Learning operates on three tiers: Tier 1 (Knowledge Update, daily), Tier 2 (Behavior Update, weekly/monthly), Tier 3 (Model Update, periodic offline only). No live model weight updates in production during Year 1.',
    category: 'decision',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['operational', 'strategic'],
    relatedConstraints: ['HC-01', 'SC-01', 'SC-02', 'SC-03', 'SC-04', 'DG-05'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0007',
    statement:
      'No production model promotion without shadow learning validation. Champion model runs production; Challenger model runs shadow. Promotion only if Challenger proves improvement.',
    category: 'decision',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['operational'],
    relatedConstraints: ['SC-04', 'DG-05', 'OVR-05'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0008',
    statement:
      'Every sensor, every data source, every learning channel enters through the same Perception Bus and feeds the same IURG. Parallel development is encouraged. Parallel minds are prohibited.',
    category: 'decision',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['operational', 'strategic'],
    relatedConstraints: ['HC-12', 'EB-06', 'DG-08'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0009',
    statement:
      'ONX does not start empty. It begins with Foundational Knowledge Corpus + Expert Playbooks + mandatory Frontier AI engines + Founder Corpus + Elite Vet Corpus.',
    category: 'decision',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['all'],
    relatedConstraints: ['HC-05', 'HC-06', 'HC-07', 'HC-11', 'EB-05', 'EB-10'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0010',
    statement:
      'GPT, Claude, Gemini, DeepSeek, Qwen, Llama are mandatory foundational cognitive engines. Never optional. Never removed. Never reduced to plugins.',
    category: 'decision',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['operational', 'strategic'],
    relatedConstraints: ['HC-06'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0011',
    statement:
      'Growth is desired but never at the cost of care quality. When growth and care conflict, care wins. Period.',
    category: 'tradeoff',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['commercial', 'clinical', 'strategic'],
    relatedConstraints: ['HC-08', 'EB-02', 'EB-03'],
    relatedPlaybooks: [
      'commercial_growth',
      'clinic_operations',
      'medical_quality',
      'branch_expansion',
    ],
  },
  {
    intentId: 'FI-2026-0012',
    statement:
      'Speed is valued but not at the expense of quality diagnosis, treatment, or customer experience. A fast wrong decision is worse than a slow right one.',
    category: 'tradeoff',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['clinical', 'operational', 'customer'],
    relatedConstraints: ['SC-09', 'DG-01'],
    relatedPlaybooks: ['clinic_operations', 'reception', 'medical_quality'],
  },
  {
    intentId: 'FI-2026-0013',
    statement:
      'Financial optimization never overrides mercy. A case that needs care but cannot pay still receives care.',
    category: 'tradeoff',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['clinical', 'commercial'],
    relatedConstraints: ['HC-08', 'EB-02', 'OVR-01'],
    relatedPlaybooks: ['clinic_operations', 'medical_quality', 'crisis_response'],
  },
  {
    intentId: 'FI-2026-0014',
    statement:
      'Automation is embraced for efficiency but never where human trust is at stake. Medical, personnel, and crisis responses always maintain human-in-the-loop.',
    category: 'tradeoff',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['clinical', 'people', 'operational'],
    relatedConstraints: ['HC-02', 'DG-01', 'DG-02', 'DG-03'],
    relatedPlaybooks: ['clinic_operations', 'medical_quality', 'crisis_response'],
  },
  {
    intentId: 'FI-2026-0015',
    statement:
      'Expansion is desired but never before operational excellence is proven at existing branches.',
    category: 'tradeoff',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['strategic', 'operational'],
    relatedConstraints: ['SC-06', 'DG-03', 'OVR-04'],
    relatedPlaybooks: ['branch_expansion', 'clinic_operations'],
  },
  {
    intentId: 'FI-2026-0016',
    statement:
      'Reducing veterinary staff for short-term cost savings increased monthly profit but damaged reputation for three years. Never repeat this mistake.',
    category: 'failure',
    constraintTypeCandidate: 'EB',
    affectedDomains: ['people', 'commercial', 'operational'],
    relatedConstraints: ['EB-03', 'HC-08', 'OVR-03'],
    relatedPlaybooks: ['clinic_operations', 'staff_performance', 'commercial_growth'],
  },
  {
    intentId: 'FI-2026-0017',
    statement:
      'Changing appointment slot duration without customer communication caused a no-show spike. Any schedule change requires 48-hour advance customer communication.',
    category: 'failure',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['operational', 'customer'],
    relatedConstraints: ['SC-09', 'DG-09'],
    relatedPlaybooks: ['clinic_operations', 'reception', 'customer_retention'],
  },
  {
    intentId: 'FI-2026-0018',
    statement:
      'When a receptionist transition includes 7-day overlap (outgoing trains incoming), customer experience remains stable and conversion does not drop.',
    category: 'success',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['operational', 'customer', 'people'],
    relatedConstraints: ['SC-09', 'DG-09'],
    relatedPlaybooks: ['reception', 'staff_performance'],
  },
  {
    intentId: 'FI-2026-0019',
    statement:
      'Price increases are acceptable when accompanied by 90-day customer retention monitoring and immediate rollback trigger if retention drops >5%.',
    category: 'success',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['commercial', 'customer'],
    relatedConstraints: ['OVR-02', 'DG-04'],
    relatedPlaybooks: ['commercial_growth', 'revenue_optimization', 'customer_retention'],
  },
  {
    intentId: 'FI-2026-0020',
    statement:
      'In emergency medical situations where animal welfare is at immediate risk, normal constraints (including staff ratios and approval gates) may be overridden. Log and notify Founder within 1 hour.',
    category: 'exception',
    constraintTypeCandidate: 'OR',
    affectedDomains: ['clinical'],
    relatedConstraints: ['OR-01', 'EB-01'],
    relatedPlaybooks: ['clinic_operations', 'medical_quality', 'crisis_response'],
  },
  {
    intentId: 'FI-2026-0021',
    statement:
      'If Founder Intent conflicts with legal or regulatory requirements, the legal requirement prevails. Founder is notified immediately.',
    category: 'exception',
    constraintTypeCandidate: 'OR',
    affectedDomains: ['all'],
    relatedConstraints: ['OR-04', 'HC-08'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0022',
    statement:
      'During institutional crisis, the first priority is stabilizing care quality. All other decisions are secondary until care is secured.',
    category: 'crisis',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['clinical', 'operational', 'strategic'],
    relatedConstraints: ['HC-08', 'EB-02', 'DG-03'],
    relatedPlaybooks: ['crisis_response', 'clinic_operations', 'medical_quality'],
  },
  {
    intentId: 'FI-2026-0023',
    statement:
      'In crisis, communication with customers and staff must be transparent, immediate, and honest. No cover-ups. No delayed admission.',
    category: 'crisis',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['operational', 'customer', 'people'],
    relatedConstraints: ['SC-01', 'OVR-07'],
    relatedPlaybooks: ['crisis_response', 'brand_reputation', 'reception'],
  },
  {
    intentId: 'FI-2026-0024',
    statement:
      'Growth must be sustainable and value-aligned. Rapid growth that compromises care, culture, or quality is rejected.',
    category: 'growth',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['strategic', 'operational'],
    relatedConstraints: ['SC-06', 'DG-03', 'OVR-04'],
    relatedPlaybooks: ['commercial_growth', 'branch_expansion', 'staff_performance'],
  },
  {
    intentId: 'FI-2026-0025',
    statement:
      'ONX must actively leverage the strongest intelligence available in the world. Frontier AI models are mandatory foundational engines, not optional tools.',
    category: 'growth',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['operational', 'strategic'],
    relatedConstraints: ['HC-06', 'HC-11'],
    relatedPlaybooks: ['all'],
  },
  {
    intentId: 'FI-2026-0026',
    statement:
      'An animal in need is never turned away because the owner cannot pay. Alternative payment, charity care, or institutional subsidy — but never refusal of care for financial reasons.',
    category: 'mercy',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['clinical'],
    relatedConstraints: ['HC-08', 'EB-02'],
    relatedPlaybooks: ['clinic_operations', 'medical_quality', 'crisis_response'],
  },
  {
    intentId: 'FI-2026-0027',
    statement:
      'Every mercy care case is documented — not for judgment, but for understanding institutional burden and ensuring sustainability of the mercy commitment.',
    category: 'mercy',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['clinical', 'commercial'],
    relatedConstraints: ['HC-03', 'OVR-08'],
    relatedPlaybooks: ['clinic_operations', 'medical_quality'],
  },
  {
    intentId: 'FI-2026-0028',
    statement:
      'Institutional reputation is valued above short-term profit. A decision that damages reputation for a year is worse than a decision that reduces profit for a quarter.',
    category: 'reputation',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['commercial', 'strategic'],
    relatedConstraints: ['HC-08', 'EB-03', 'OVR-02'],
    relatedPlaybooks: ['commercial_growth', 'brand_reputation', 'crisis_response'],
  },
  {
    intentId: 'FI-2026-0029',
    statement:
      'Every negative review receives a response within 24 hours. The response is human-written (not AI-generated), empathetic, and offers concrete resolution.',
    category: 'reputation',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['customer', 'operational'],
    relatedConstraints: ['SC-01', 'DG-07'],
    relatedPlaybooks: ['brand_reputation', 'customer_retention', 'reception'],
  },
  {
    intentId: 'FI-2026-0030',
    statement:
      'No discount exceeding 30% without CEO approval. No discount that compromises care quality or attracts non-ideal customer segments.',
    category: 'commercial',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['commercial', 'customer'],
    relatedConstraints: ['DG-04', 'EB-02', 'OVR-02'],
    relatedPlaybooks: ['commercial_growth', 'revenue_optimization', 'reception'],
  },
  {
    intentId: 'FI-2026-0031',
    statement:
      'We optimize for customer lifetime value and care alignment, not customer volume. Aggressive acquisition that brings misaligned customers is rejected.',
    category: 'commercial',
    constraintTypeCandidate: 'AC',
    affectedDomains: ['commercial', 'customer'],
    relatedConstraints: ['AC-06', 'OVR-02'],
    relatedPlaybooks: ['commercial_growth', 'customer_retention', 'revenue_optimization'],
  },
  {
    intentId: 'FI-2026-0032',
    statement:
      'Veterinarians have final authority on medical decisions. ONX may recommend protocols and present evidence, but the treating veterinarian decides. No autonomous medical action by ONX.',
    category: 'medical',
    constraintTypeCandidate: 'HC',
    affectedDomains: ['clinical'],
    relatedConstraints: ['HC-02', 'DG-01', 'EB-01', 'OVR-01'],
    relatedPlaybooks: ['clinic_operations', 'medical_quality', 'crisis_response'],
  },
  {
    intentId: 'FI-2026-0033',
    statement:
      'New clinical protocols require evidence from at least 2 veterinary sources and approval from head veterinarian.',
    category: 'medical',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['clinical'],
    relatedConstraints: ['SC-08', 'DG-01', 'OVR-01'],
    relatedPlaybooks: ['clinic_operations', 'medical_quality'],
  },
  {
    intentId: 'FI-2026-0034',
    statement:
      'Invest in developing people before replacing them. Training, coaching, and growth opportunities are preferred over termination. Termination is the last resort.',
    category: 'people',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['people', 'operational'],
    relatedConstraints: ['HC-02', 'DG-02', 'OVR-03'],
    relatedPlaybooks: ['staff_performance', 'clinic_operations', 'crisis_response'],
  },
  {
    intentId: 'FI-2026-0035',
    statement:
      'A new branch opens only when: existing branches show 6+ months sustained quality, operational playbook is validated, leadership is trained, and the financial model shows 18-month sustainability without cross-subsidy.',
    category: 'expansion',
    constraintTypeCandidate: 'SC',
    affectedDomains: ['strategic', 'operational'],
    relatedConstraints: ['SC-06', 'DG-03', 'OVR-04', 'HC-11'],
    relatedPlaybooks: ['branch_expansion', 'clinic_operations', 'staff_performance'],
  },
  {
    intentId: 'FI-2026-0036',
    statement:
      'NEVER reduce clinical staff (veterinarians, nurses, technicians) to improve short-term revenue or cost metrics. This is permanently blocked.',
    category: 'non_negotiable',
    constraintTypeCandidate: 'EB',
    affectedDomains: ['people', 'clinical', 'commercial'],
    relatedConstraints: ['EB-03', 'HC-08', 'EB-02'],
    relatedPlaybooks: [
      'clinic_operations',
      'staff_performance',
      'commercial_growth',
      'revenue_optimization',
    ],
  },
  {
    intentId: 'FI-2026-0037',
    statement:
      'NEVER compromise the quality of veterinary care for operational efficiency. Longer wait times, rushed examinations, or reduced treatment standards are permanently blocked.',
    category: 'non_negotiable',
    constraintTypeCandidate: 'EB',
    affectedDomains: ['clinical', 'operational'],
    relatedConstraints: ['EB-02', 'HC-08', 'OVR-01'],
    relatedPlaybooks: ['clinic_operations', 'medical_quality', 'crisis_response'],
  },
  {
    intentId: 'FI-2026-0038',
    statement:
      'NEVER allow ONX Intelligence to operate without Founder Corpus and Elite Vet Corpus loaded. System startup is blocked until both corpora are present.',
    category: 'non_negotiable',
    constraintTypeCandidate: 'EB',
    affectedDomains: ['all'],
    relatedConstraints: ['EB-05', 'EB-10', 'HC-07', 'HC-11'],
    relatedPlaybooks: ['all'],
  },
] as const;

// ---------------------------------------------------------------------------
// Constraint definition shape
// ---------------------------------------------------------------------------

export interface FicConstraintDef {
  id: string;
  kind: FicConstraintKind;
  title: string;
  statement: string;
  source: string;
  /** Affected domains; empty or ['all'] => applies to every domain. */
  domains: string[];
  /** Signal key the engine inspects to decide if this constraint is triggered. */
  signal?: string;
  /** For EB: whether the block is automatic (no human needed to block). */
  autoBlock?: boolean;
  /** For EB: the auto-unblock condition text. */
  autoUnblock?: string;
  /** For DG: the human approver required. */
  approver?: string;
  /** For DG: the trigger description. */
  trigger?: string;
  /** For SC/OR: the documented override condition. */
  overrideCondition?: string;
  /** For OVR: post-execution timing + failure action. */
  timing?: string;
  failureAction?: string;
}

const ALL = ['all'];

// ---------------------------------------------------------------------------
// Section 2 — Hard Constraints (12). Violation = automatic rejection.
// ---------------------------------------------------------------------------

export const HARD_CONSTRAINTS: readonly FicConstraintDef[] = [
  {
    id: 'HC-01',
    kind: 'HC',
    title: 'No online model weight updates in production (Year 1)',
    statement:
      'Model updates (fine-tuning, LoRA, adapters) occur ONLY in offline environments with full validation before deployment.',
    source: 'Statements 7, 10, 28, 29, 30',
    domains: ['operational', 'strategic'],
    signal: 'liveWeightUpdate',
  },
  {
    id: 'HC-02',
    kind: 'HC',
    title: 'No autonomous decision in medical, hiring, firing, or branch closure',
    statement: 'ONX recommends; human decides.',
    source: 'Statement 26',
    domains: ['clinical', 'people', 'strategic'],
    signal: 'autonomousDecision',
  },
  {
    id: 'HC-03',
    kind: 'HC',
    title: 'No presentation of unverified claims as operational truth',
    statement:
      'Every output classified by evidence tier: Proven / Probable / Speculative / Unverified.',
    source: 'Statements 2, 12',
    domains: ALL,
    signal: 'claimsProvenWithoutEvidence',
  },
  {
    id: 'HC-04',
    kind: 'HC',
    title: 'No destructive update to accumulated Institutional Understanding',
    statement: 'All changes are append, revision, or supersession — never overwrite or delete.',
    source: 'Statement 42',
    domains: ['operational', 'strategic'],
    signal: 'destructiveOverwrite',
  },
  {
    id: 'HC-05',
    kind: 'HC',
    title: 'No scope convergence to commodity AI categories',
    statement:
      'ONX Intelligence is never reduced to: chatbot, copilot, RAG platform, vector DB, or decision support tool.',
    source: 'Statements 31, 32, 33',
    domains: ['operational', 'strategic'],
    signal: 'scopeConvergence',
  },
  {
    id: 'HC-06',
    kind: 'HC',
    title: 'Mandatory Frontier AI integration',
    statement:
      'GPT, Claude, Gemini, DeepSeek, Qwen, Llama must be available as cognitive engines — never optional, never removed.',
    source: 'Statement 35',
    domains: ['operational', 'strategic'],
    signal: 'frontierAiRemoved',
  },
  {
    id: 'HC-07',
    kind: 'HC',
    title: 'Mandatory Founder Corpus and Elite Vet Corpus',
    statement: 'These are not optional data sources — they are constitutional inputs.',
    source: 'Statements 45, 46',
    domains: ALL,
    signal: 'corpusMissing',
  },
  {
    id: 'HC-08',
    kind: 'HC',
    title: 'Founder Intent is the supreme constraint layer',
    statement:
      'At any conflict between Founder Intent and data/evidence/optimization, Founder Intent prevails — unless a formal Constitutional Review Process is triggered and completed.',
    source: 'Statements 41, 43',
    domains: ALL,
    signal: 'profitOverCare',
  },
  {
    id: 'HC-09',
    kind: 'HC',
    title: 'Knowledge entering ONX must be structured',
    statement:
      'Raw text alone is insufficient. Must transform to Principles, Playbooks, Decision Rules, Operating Models, with full chain.',
    source: 'Statements 1, 3',
    domains: ['operational', 'strategic'],
    signal: 'unstructuredKnowledge',
  },
  {
    id: 'HC-10',
    kind: 'HC',
    title: 'The three irreversible discoveries are architecture-level axioms',
    statement:
      'Knowledge != Judgment, Perception != Understanding, Learning != Growth must be preserved in every component design.',
    source: 'Statement 38',
    domains: ALL,
    signal: 'discoveriesViolated',
  },
  {
    id: 'HC-11',
    kind: 'HC',
    title: 'No learning from zero',
    statement:
      'ONX always begins with pre-loaded Foundational Knowledge Corpus + Expert Playbooks. Empty-start architectures are rejected.',
    source: 'Statements 5, 6, 34',
    domains: ALL,
    signal: 'zeroStart',
  },
  {
    id: 'HC-12',
    kind: 'HC',
    title: 'Single unified mind — no parallel intelligence streams',
    statement:
      'Every sensor, every data source, every learning channel enters through the same Perception Bus and feeds the same IURG.',
    source: 'Statements 15, 16',
    domains: ['operational', 'strategic'],
    signal: 'parallelIntelligenceStream',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 3 — Soft Constraints (12). Strong defaults; overridable with cause.
// ---------------------------------------------------------------------------

export const SOFT_CONSTRAINTS: readonly FicConstraintDef[] = [
  {
    id: 'SC-01',
    kind: 'SC',
    title: 'Knowledge Update (Tier 1): Daily',
    statement: 'Playbooks, rules, lessons refresh daily from validated feedback.',
    source: 'FIC v0.2',
    domains: ['operational'],
    signal: 'skipDailyKnowledgeUpdate',
    overrideCondition: 'Emergency freeze during crisis',
  },
  {
    id: 'SC-02',
    kind: 'SC',
    title: 'Behavior Update (Tier 2): Weekly/Monthly',
    statement: 'Recommendations, priorities, alerts, decision templates update monthly.',
    source: 'FIC v0.2',
    domains: ['operational'],
    signal: 'skipBehaviorUpdate',
    overrideCondition: 'Accelerated if rapid market change detected',
  },
  {
    id: 'SC-03',
    kind: 'SC',
    title: 'Model Update (Tier 3): Periodic only after strong validation',
    statement: 'Offline fine-tuning with champion/challenger verification before deployment.',
    source: 'FIC v0.2',
    domains: ['operational'],
    signal: 'unvalidatedModelUpdate',
    overrideCondition: 'Critical security patch requiring immediate update',
  },
  {
    id: 'SC-04',
    kind: 'SC',
    title: 'Shadow Learning mandatory before any model promotion',
    statement: 'No production model update without shadow validation proving improvement.',
    source: 'FIC v0.2',
    domains: ['operational'],
    signal: 'modelPromotionWithoutShadow',
    overrideCondition: 'Emergency security fix',
  },
  {
    id: 'SC-05',
    kind: 'SC',
    title: 'Every observation -> pattern requires minimum 3 occurrences',
    statement: 'No single-event pattern recognition.',
    source: 'FIC v0.2',
    domains: ['operational'],
    signal: 'singleEventPattern',
    overrideCondition: 'Single catastrophic event with irreversible impact',
  },
  {
    id: 'SC-06',
    kind: 'SC',
    title: 'Every pattern -> rule requires minimum 2-branch validation',
    statement: 'No branch-specific rule becomes institutional without cross-branch proof.',
    source: 'FIC v0.2',
    domains: ['operational', 'strategic'],
    signal: 'singleBranchRule',
    overrideCondition: 'Single-branch emergency protocol',
  },
  {
    id: 'SC-07',
    kind: 'SC',
    title: 'Document structure: 3 Volumes',
    statement: 'Constitution, Architecture, Civilization Engine.',
    source: 'FIC v0.2',
    domains: ['strategic'],
    signal: 'documentStructureViolation',
    overrideCondition: 'None — structural decision',
  },
  {
    id: 'SC-08',
    kind: 'SC',
    title: 'Understanding synthesis requires minimum 2 corroborating sources',
    statement: 'No understanding from single-source perception.',
    source: 'FIC v0.2',
    domains: ['clinical', 'operational'],
    signal: 'singleSourceUnderstanding',
    overrideCondition: 'Founder-direct observation',
  },
  {
    id: 'SC-09',
    kind: 'SC',
    title: 'Temporal validation required for causal claims',
    statement: 'No same-day causation claims. Causal chains need time to manifest.',
    source: 'FIC v0.2',
    domains: ['clinical', 'operational', 'customer'],
    signal: 'sameDayCausation',
    overrideCondition: 'Immediate safety threat',
  },
  {
    id: 'SC-10',
    kind: 'SC',
    title: 'Playbook execution pauses if Founder Intent conflict detected',
    statement: 'SECH must flag Intent conflicts before execution proceeds.',
    source: 'FIC v0.2',
    domains: ALL,
    signal: 'unflaggedIntentConflict',
    overrideCondition: 'Founder explicitly overrides own Intent',
  },
  {
    id: 'SC-11',
    kind: 'SC',
    title: 'Crisis communication must be transparent, immediate, and honest',
    statement: 'No cover-ups. Response within 24 hours.',
    source: 'FI-2026-0023 (v0.2 NEW)',
    domains: ['operational', 'customer', 'people'],
    signal: 'delayedOrOpaqueCrisisComms',
    overrideCondition: 'Crisis protocol activation',
  },
  {
    id: 'SC-12',
    kind: 'SC',
    title: 'People development preferred over replacement',
    statement: 'Training and coaching first. Termination is last resort.',
    source: 'FI-2026-0034 (v0.2 NEW)',
    domains: ['people', 'operational'],
    signal: 'replacementBeforeDevelopment',
    overrideCondition: 'Safety-critical personnel violation',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 4 — Advisory Constraints (6). Guide but do not bind.
// ---------------------------------------------------------------------------

export const ADVISORY_CONSTRAINTS: readonly FicConstraintDef[] = [
  {
    id: 'AC-01',
    kind: 'AC',
    title: 'Prefer RAG + KG over model fine-tuning in Year 1',
    statement: 'Default architecture choice.',
    source: 'FIC v0.2',
    domains: ['operational', 'strategic'],
  },
  {
    id: 'AC-02',
    kind: 'AC',
    title: 'Perception sources enter in parallel, but through same Bus',
    statement: 'Integration approach.',
    source: 'FIC v0.2',
    domains: ['operational'],
  },
  {
    id: 'AC-03',
    kind: 'AC',
    title: 'Institutional Understanding Capital growth tracked as primary KPI',
    statement: 'Success metric.',
    source: 'FIC v0.2',
    domains: ['strategic'],
  },
  {
    id: 'AC-04',
    kind: 'AC',
    title: 'Founder decisions/failures/judgment carry higher weight than external frameworks',
    statement: 'Weighting scheme.',
    source: 'FIC v0.2',
    domains: ALL,
  },
  {
    id: 'AC-05',
    kind: 'AC',
    title: 'Evidence quality hierarchy',
    statement:
      'Elite Vet data > Founder observation > Consulting framework > General AI knowledge.',
    source: 'FIC v0.2',
    domains: ALL,
  },
  {
    id: 'AC-06',
    kind: 'AC',
    title: 'Long-term prosperity > short-term profit in advisory calculations',
    statement: 'Optimization direction.',
    source: 'FIC v0.2',
    domains: ['commercial', 'strategic'],
  },
] as const;

// ---------------------------------------------------------------------------
// Section 5 — Decision Gates (12). Hard stops requiring human authorization.
// ---------------------------------------------------------------------------

export const DECISION_GATES: readonly FicConstraintDef[] = [
  {
    id: 'DG-01',
    kind: 'DG',
    title: 'Medical Protocol Gate',
    statement: 'Any treatment protocol change or recommendation requires veterinarian approval.',
    source: 'FIC v0.2',
    domains: ['clinical'],
    trigger: 'Any treatment protocol change or recommendation',
    approver: 'Veterinarian',
    signal: 'medicalProtocolChange',
  },
  {
    id: 'DG-02',
    kind: 'DG',
    title: 'Personnel Gate',
    statement: 'Hiring, firing, promotion, or role change requires HR + Founder approval.',
    source: 'FIC v0.2',
    domains: ['people'],
    trigger: 'Hiring, firing, promotion, or role change',
    approver: 'HR + Founder',
    signal: 'personnelChange',
  },
  {
    id: 'DG-03',
    kind: 'DG',
    title: 'Strategic Gate',
    statement:
      'Branch open/close, partnership, or major investment requires Board/Founder approval.',
    source: 'FIC v0.2',
    domains: ['strategic'],
    trigger: 'Branch open/close, partnership, or major investment',
    approver: 'Board/Founder',
    signal: 'strategicChange',
  },
  {
    id: 'DG-04',
    kind: 'DG',
    title: 'Discount Gate',
    statement: 'Discount > 30% or revenue-affecting promotion requires Finance/CEO approval.',
    source: 'FIC v0.2',
    domains: ['commercial', 'customer'],
    trigger: 'Discount > 30% or revenue-affecting promotion',
    approver: 'Finance/CEO',
    signal: 'discountGate',
  },
  {
    id: 'DG-05',
    kind: 'DG',
    title: 'Model Deployment Gate',
    statement: 'Any model update to production requires Technical Lead + Founder approval.',
    source: 'FIC v0.2',
    domains: ['operational'],
    trigger: 'Any model update to production',
    approver: 'Technical Lead + Founder',
    signal: 'modelDeployment',
  },
  {
    id: 'DG-06',
    kind: 'DG',
    title: 'Constitutional Amendment Gate',
    statement: 'Any change to Hard Constraints 1-12 requires Founding Team Unanimous approval.',
    source: 'FIC v0.2',
    domains: ALL,
    trigger: 'Any change to Hard Constraints 1-12',
    approver: 'Founding Team Unanimous',
    signal: 'constitutionalAmendment',
  },
  {
    id: 'DG-07',
    kind: 'DG',
    title: 'Playbook Activation Gate',
    statement: 'New Playbook or major Playbook revision requires Department Head approval.',
    source: 'FIC v0.2',
    domains: ['operational'],
    trigger: 'New Playbook or major Playbook revision',
    approver: 'Department Head',
    signal: 'playbookActivation',
  },
  {
    id: 'DG-08',
    kind: 'DG',
    title: 'Sensor Integration Gate',
    statement: 'New perception source entering ONX requires Technical Lead + Operations approval.',
    source: 'FIC v0.2',
    domains: ['operational'],
    trigger: 'New perception source entering ONX',
    approver: 'Technical Lead + Operations',
    signal: 'sensorIntegration',
  },
  {
    id: 'DG-09',
    kind: 'DG',
    title: 'Judgment Promotion Gate',
    statement: 'Pattern -> Preliminary Judgment transition requires Operations Manager approval.',
    source: 'FIC v0.2',
    domains: ['operational'],
    trigger: 'Pattern -> Preliminary Judgment transition',
    approver: 'Operations Manager',
    signal: 'judgmentPromotion',
  },
  {
    id: 'DG-10',
    kind: 'DG',
    title: 'Rule Institutionalization Gate',
    statement: 'Validated Judgment -> Institutional Rule requires Founder approval.',
    source: 'FIC v0.2',
    domains: ['strategic'],
    trigger: 'Validated Judgment -> Institutional Rule',
    approver: 'Founder',
    signal: 'ruleInstitutionalization',
  },
  {
    id: 'DG-11',
    kind: 'DG',
    title: 'Brand/Reputation Gate',
    statement:
      'Any public-facing decision affecting brand perception requires Marketing Head approval.',
    source: 'FIC v0.2 (NEW)',
    domains: ['customer', 'commercial'],
    trigger: 'Any public-facing decision affecting brand perception',
    approver: 'Marketing Head',
    signal: 'brandDecision',
  },
  {
    id: 'DG-12',
    kind: 'DG',
    title: 'Mercy Care Gate',
    statement: 'Every mercy care case documented for institutional burden tracking.',
    source: 'FIC v0.2 (NEW)',
    domains: ['clinical'],
    trigger: 'Every mercy care case',
    approver: 'Operations Manager',
    signal: 'mercyCare',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 6 — Execution Blocks (12). Auto-block; human needed only to unblock.
// ---------------------------------------------------------------------------

export const EXECUTION_BLOCKS: readonly FicConstraintDef[] = [
  {
    id: 'EB-01',
    kind: 'EB',
    title: 'Medical Override Block',
    statement: 'Treatment recommendation contradicts veterinary best practices or safety protocol.',
    source: 'FIC v0.2',
    domains: ['clinical'],
    signal: 'medicalRecommendationUnsafe',
    autoBlock: true,
    autoUnblock: 'Never — requires veterinarian review',
  },
  {
    id: 'EB-02',
    kind: 'EB',
    title: 'Profit-over-Care Block',
    statement: 'Decision increases profit but reduces quality of veterinary care.',
    source: 'FIC v0.2',
    domains: ['clinical', 'commercial'],
    signal: 'profitOverCare',
    autoBlock: true,
    autoUnblock: 'Never — requires Founder explicit override',
  },
  {
    id: 'EB-03',
    kind: 'EB',
    title: 'Staff-Reduction Revenue Block',
    statement: 'Proposal reduces clinical staff to boost short-term revenue.',
    source: 'FIC v0.2',
    domains: ['people', 'clinical', 'commercial'],
    signal: 'reducesClinicalStaffForRevenue',
    autoBlock: true,
    autoUnblock: 'Requires Founder + 7-day cooling period',
  },
  {
    id: 'EB-04',
    kind: 'EB',
    title: 'Unverified Claim Block',
    statement: 'Output claims status as "Proven" without meeting evidence threshold.',
    source: 'FIC v0.2',
    domains: ALL,
    signal: 'claimsProvenWithoutEvidence',
    autoBlock: true,
    autoUnblock: 'Downgrades to "Probable" or "Speculative" automatically',
  },
  {
    id: 'EB-05',
    kind: 'EB',
    title: 'Zero-Start Block',
    statement: 'System initialization without pre-loaded knowledge corpus.',
    source: 'FIC v0.2',
    domains: ALL,
    signal: 'zeroStart',
    autoBlock: true,
    autoUnblock: 'Blocks startup until mandatory corpora loaded',
  },
  {
    id: 'EB-06',
    kind: 'EB',
    title: 'Parallel Mind Block',
    statement: 'New sensor attempting to establish separate intelligence stream.',
    source: 'FIC v0.2',
    domains: ['operational'],
    signal: 'parallelIntelligenceStream',
    autoBlock: true,
    autoUnblock: 'Blocks until integrated into Unified Perception Bus',
  },
  {
    id: 'EB-07',
    kind: 'EB',
    title: 'Live Weight Update Block',
    statement: 'Attempt to update model weights in production environment.',
    source: 'FIC v0.2',
    domains: ['operational'],
    signal: 'liveWeightUpdate',
    autoBlock: true,
    autoUnblock: 'Blocks — redirects to offline shadow environment',
  },
  {
    id: 'EB-08',
    kind: 'EB',
    title: 'Overwrite Block',
    statement: 'Attempt to destructively overwrite accumulated understanding.',
    source: 'FIC v0.2',
    domains: ['operational', 'strategic'],
    signal: 'destructiveOverwrite',
    autoBlock: true,
    autoUnblock: 'Converts to append/revision/supersession automatically',
  },
  {
    id: 'EB-09',
    kind: 'EB',
    title: 'Scope Creep Block',
    statement:
      'Output or architecture converging to excluded categories (chatbot, RAG platform, etc.).',
    source: 'FIC v0.2',
    domains: ['operational', 'strategic'],
    signal: 'scopeConvergence',
    autoBlock: true,
    autoUnblock: 'Flags for review — requires architecture team sign-off',
  },
  {
    id: 'EB-10',
    kind: 'EB',
    title: 'Missing Corpus Block',
    statement: 'Operation attempted without Founder Corpus or Elite Vet Corpus loaded.',
    source: 'FIC v0.2',
    domains: ALL,
    signal: 'corpusMissing',
    autoBlock: true,
    autoUnblock: 'Blocks operation — loads mandatory corpora',
  },
  {
    id: 'EB-11',
    kind: 'EB',
    title: 'Discount Quality Block',
    statement:
      'Any discount proposal that would attract misaligned customer segments is auto-blocked.',
    source: 'FI-2026-0031 (v0.2 NEW)',
    domains: ['commercial', 'customer'],
    signal: 'misalignedCustomerSegment',
    autoBlock: true,
    autoUnblock: 'Marketing Head review required',
  },
  {
    id: 'EB-12',
    kind: 'EB',
    title: 'Review Response Block',
    statement:
      'No AI-generated response to negative reviews. All negative review responses must be human-written.',
    source: 'FI-2026-0029 (v0.2 NEW)',
    domains: ['customer', 'operational'],
    signal: 'aiGeneratedReviewResponse',
    autoBlock: true,
    autoUnblock: 'Never — human-written required',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 7 — Outcome Validation Rules (10). Post-execution checks.
// ---------------------------------------------------------------------------

export const OUTCOME_VALIDATION_RULES: readonly FicConstraintDef[] = [
  {
    id: 'OVR-01',
    kind: 'OVR',
    title: 'Care Quality Check',
    statement: 'Every clinical decision outcome — 30-day follow-up.',
    source: 'FIC v0.2',
    domains: ['clinical'],
    timing: 'Every clinical decision outcome — 30-day follow-up',
    failureAction: 'If quality metric drops -> Flag to DG-01 + trigger review',
  },
  {
    id: 'OVR-02',
    kind: 'OVR',
    title: 'Revenue Integrity Check',
    statement: 'Every discount/promotion — 90-day ROI analysis.',
    source: 'FIC v0.2',
    domains: ['commercial', 'customer'],
    timing: 'Every discount/promotion — 90-day ROI analysis',
    failureAction: 'If ROI negative OR customer quality degraded -> Flag to DG-04',
  },
  {
    id: 'OVR-03',
    kind: 'OVR',
    title: 'Staff Impact Check',
    statement: 'Every personnel change — 60-day team performance review.',
    source: 'FIC v0.2',
    domains: ['people'],
    timing: 'Every personnel change — 60-day team performance review',
    failureAction: 'If team performance drops > 15% -> Trigger DG-02 review',
  },
  {
    id: 'OVR-04',
    kind: 'OVR',
    title: 'Branch Performance Check',
    statement: 'Monthly branch KPI review against pre-change baseline.',
    source: 'FIC v0.2',
    domains: ['strategic', 'operational'],
    timing: 'Monthly branch KPI review against pre-change baseline',
    failureAction: 'If 2+ consecutive months below baseline -> Trigger strategic review',
  },
  {
    id: 'OVR-05',
    kind: 'OVR',
    title: 'Model Performance Check',
    statement: 'Post-deployment model performance vs. shadow baseline.',
    source: 'FIC v0.2',
    domains: ['operational'],
    timing: 'Post-deployment model performance vs. shadow baseline',
    failureAction: 'If shadow outperforms production -> Auto-rollback + DG-05',
  },
  {
    id: 'OVR-06',
    kind: 'OVR',
    title: 'Understanding Integrity Check',
    statement: 'Quarterly IURG audit — no silent losses, no unauthorized overwrites.',
    source: 'FIC v0.2',
    domains: ['operational', 'strategic'],
    timing: 'Quarterly IURG audit',
    failureAction: 'If integrity violation found -> Emergency lockdown + investigation',
  },
  {
    id: 'OVR-07',
    kind: 'OVR',
    title: 'Founder Intent Alignment Check',
    statement:
      'Every major decision outcome — alignment with Intent Compiler output (within 1 hour).',
    source: 'FIC v0.2',
    domains: ALL,
    timing: 'Every major decision outcome — within 1 hour',
    failureAction: 'If misalignment detected -> Escalate to Founder + log for Intent refinement',
  },
  {
    id: 'OVR-08',
    kind: 'OVR',
    title: 'Evidence Truth Check',
    statement: 'Every output labeled "Proven" — spot-check against source evidence.',
    source: 'FIC v0.2',
    domains: ALL,
    timing: 'Every output labeled "Proven"',
    failureAction: 'If label unjustified -> Downgrade + retrain evidence classifier',
  },
  {
    id: 'OVR-09',
    kind: 'OVR',
    title: 'Learning Quality Check',
    statement: 'Monthly — new understandings vs. actual outcomes.',
    source: 'FIC v0.2',
    domains: ['operational'],
    timing: 'Monthly',
    failureAction: 'If understanding confidence systematically wrong -> Trigger model review',
  },
  {
    id: 'OVR-10',
    kind: 'OVR',
    title: 'Constitutional Compliance Check',
    statement: 'Quarterly — full architecture audit against Hard Constraints 1-12.',
    source: 'FIC v0.2',
    domains: ALL,
    timing: 'Quarterly',
    failureAction: 'If any HC violated -> Emergency stop + founding team review',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 8 — Override Rules (5). Rare conditions modifying even Founder Intent.
// ---------------------------------------------------------------------------

export const OVERRIDE_RULES: readonly FicConstraintDef[] = [
  {
    id: 'OR-01',
    kind: 'OR',
    title: 'Emergency Medical Override',
    statement: 'Founder Intent constraint prevents necessary emergency veterinary care.',
    source: 'FIC v0.2',
    domains: ['clinical'],
    signal: 'emergencyMedical',
    overrideCondition:
      'Immediate veterinarian override -> Log -> Founder notification within 1 hour',
  },
  {
    id: 'OR-02',
    kind: 'OR',
    title: 'Founder Self-Override',
    statement: 'Founder explicitly overrides their own prior Intent statement.',
    source: 'FIC v0.2',
    domains: ALL,
    signal: 'founderSelfOverride',
    overrideCondition:
      'Written override -> Intent Compiler reprocesses -> New constraint versioned -> 30-day trial',
  },
  {
    id: 'OR-03',
    kind: 'OR',
    title: 'Constitutional Amendment',
    statement: 'Founder Team unanimously agrees Hard Constraint must change.',
    source: 'FIC v0.2',
    domains: ALL,
    signal: 'constitutionalAmendment',
    overrideCondition: 'DG-06 process -> Trial period -> Permanent or revert',
  },
  {
    id: 'OR-04',
    kind: 'OR',
    title: 'Legal Compliance Override',
    statement: 'Founder Intent conflicts with legal/regulatory requirement.',
    source: 'FIC v0.2',
    domains: ALL,
    signal: 'legalConflict',
    overrideCondition:
      'Legal requirement prevails -> Intent Compiler flags conflict -> Founder notified immediately',
  },
  {
    id: 'OR-05',
    kind: 'OR',
    title: 'Catastrophic Event Override',
    statement:
      'Single event with irreversible institutional impact requires violating a Soft Constraint.',
    source: 'FIC v0.2',
    domains: ALL,
    signal: 'catastrophicEvent',
    overrideCondition:
      'Emergency documentation -> 24-hour human review -> Permanent record (7-day cooling for staff reduction)',
  },
] as const;

// ---------------------------------------------------------------------------
// Combined registry + lookup index
// ---------------------------------------------------------------------------

export const ALL_CONSTRAINTS: readonly FicConstraintDef[] = [
  ...HARD_CONSTRAINTS,
  ...SOFT_CONSTRAINTS,
  ...ADVISORY_CONSTRAINTS,
  ...DECISION_GATES,
  ...EXECUTION_BLOCKS,
  ...OUTCOME_VALIDATION_RULES,
  ...OVERRIDE_RULES,
];

export const CONSTRAINTS_BY_ID: ReadonlyMap<string, FicConstraintDef> = new Map(
  ALL_CONSTRAINTS.map((c) => [c.id, c]),
);

/**
 * Number of uniquely-identified executable constraints in the registry: 69
 * (HC 12 + SC 12 + AC 6 + DG 12 + EB 12 + OVR 10 + OR 5). The CCP headline of
 * "68 executable constraints" is an off-by-one undercount — the document's own
 * per-family figures sum to 69. The v0.2 SC-01 -> SC-01a/SC-01b split is
 * represented here as a single canonical SC-01 to preserve the stated SC
 * family size of 12.
 */
export const CONSTRAINT_COUNT = ALL_CONSTRAINTS.length; // 69

// ---------------------------------------------------------------------------
// Section 9 — Conflict Resolution Classes (7)
// ---------------------------------------------------------------------------

export interface FicConflictClass {
  id: string;
  name: string;
  description: string;
  example: string;
  /** Signal key that, when true, indicates this conflict class is active. */
  signal: string;
}

export const CONFLICT_RESOLUTION_CLASSES: readonly FicConflictClass[] = [
  {
    id: 'C1',
    name: 'Growth vs Care',
    description: 'Revenue growth compromises care quality.',
    example: 'Open 5th branch fast vs. maintain care standards.',
    signal: 'conflictGrowthVsCare',
  },
  {
    id: 'C2',
    name: 'Speed vs Quality',
    description: 'Fast execution compromises thoroughness.',
    example: '24-hour new protocol rollout vs. 3-week validation.',
    signal: 'conflictSpeedVsQuality',
  },
  {
    id: 'C3',
    name: 'Profit vs Mercy',
    description: 'Financial optimization vs. animal welfare.',
    example: 'Refuse uninsured emergency case vs. provide charity care.',
    signal: 'conflictProfitVsMercy',
  },
  {
    id: 'C4',
    name: 'Automation vs Human Trust',
    description: 'Efficiency vs. human relationship.',
    example: 'Auto-respond to all WhatsApp vs. human empathy.',
    signal: 'conflictAutomationVsTrust',
  },
  {
    id: 'C5',
    name: 'Expansion vs Stability',
    description: 'New branches vs. existing quality.',
    example: 'Open 3 branches simultaneously vs. sequential proven expansion.',
    signal: 'conflictExpansionVsStability',
  },
  {
    id: 'C6',
    name: 'Efficiency vs Reputation',
    description: 'Cost reduction vs. brand perception.',
    example: 'Reduce reception hours vs. 24/7 availability promise.',
    signal: 'conflictEfficiencyVsReputation',
  },
  {
    id: 'C7',
    name: 'Founder Override vs Evidence',
    description: 'Founder intuition vs. data.',
    example: 'Founder says "do X" but data says "X will fail".',
    signal: 'conflictFounderVsEvidence',
  },
] as const;

// ---------------------------------------------------------------------------
// Priority Hierarchy (8 levels, highest first)
// ---------------------------------------------------------------------------

export interface FicPriorityLevel {
  level: number;
  name: string;
  description: string;
}

export const PRIORITY_HIERARCHY: readonly FicPriorityLevel[] = [
  { level: 1, name: 'EMERGENCY / SAFETY', description: 'Animal welfare at immediate risk.' },
  { level: 2, name: 'LEGAL COMPLIANCE', description: 'Regulatory requirement.' },
  { level: 3, name: 'CONSTITUTIONAL PILLAR', description: 'HC-08 four pillars.' },
  { level: 4, name: 'NON-NEGOTIABLE', description: 'FI-2026-0036 to 0038.' },
  { level: 5, name: 'ACTIVE FOUNDER INTENT', description: 'Version CURRENT, state ACTIVE.' },
  { level: 6, name: 'INSTITUTIONAL JUDGMENT', description: 'Validated over 6+ months.' },
  { level: 7, name: 'EXPERIMENTAL INTENT', description: 'Version EXPERIMENTAL.' },
  { level: 8, name: 'ADVISORY CONSTRAINT', description: 'Weakest, easily overridden.' },
] as const;

// ---------------------------------------------------------------------------
// Section 10 — Playbook Constraint Mappings (10 playbooks)
// ---------------------------------------------------------------------------

export interface FicPlaybookActivity {
  activity: string;
  constraints: string[];
  behavior: string;
}

export interface FicPlaybookMapping {
  id: string;
  name: string;
  activities: FicPlaybookActivity[];
}

export const PLAYBOOK_CONSTRAINT_MAPPINGS: readonly FicPlaybookMapping[] = [
  {
    id: 'clinic_operations',
    name: 'Clinic Operations',
    activities: [
      {
        activity: 'Schedule appointments',
        constraints: ['HC-12', 'SC-01', 'AC-04'],
        behavior: 'Daily optimization; single-Bus feed mandatory',
      },
      {
        activity: 'Adjust slot durations',
        constraints: ['SC-09', 'DG-09', 'OVR-04'],
        behavior: '48hr customer communication required; 3-week validation',
      },
      {
        activity: 'Change clinical protocols',
        constraints: ['DG-01', 'EB-01', 'OVR-01'],
        behavior: 'Veterinarian approval mandatory',
      },
      {
        activity: 'Manage inventory',
        constraints: ['HC-03', 'SC-01', 'OVR-06'],
        behavior: 'Proven tier only; reorder triggers daily',
      },
      {
        activity: 'Assign veterinarians to shifts',
        constraints: ['HC-08', 'EB-03', 'OVR-03'],
        behavior: 'Never reduce clinical staff for short-term revenue',
      },
      {
        activity: 'Handle no-shows',
        constraints: ['SC-05', 'DG-09', 'AC-04'],
        behavior: 'Pattern requires 3+ occurrences',
      },
      {
        activity: 'Emergency case triage',
        constraints: ['OR-01', 'HC-02', 'EB-01'],
        behavior: 'Medical need overrides all constraints',
      },
      {
        activity: 'Close clinic early',
        constraints: ['DG-03', 'HC-08', 'OVR-04'],
        behavior: 'Founder approval required if non-emergency',
      },
      {
        activity: 'Open new service line',
        constraints: ['DG-03', 'DG-07', 'HC-11'],
        behavior: 'Must load relevant Playbook first',
      },
      {
        activity: 'Report clinic KPIs',
        constraints: ['HC-03', 'OVR-08', 'AC-03'],
        behavior: 'All claims evidence-tiered',
      },
    ],
  },
  {
    id: 'reception',
    name: 'Reception',
    activities: [
      {
        activity: 'Answer incoming calls',
        constraints: ['HC-12', 'AC-02', 'SC-01'],
        behavior: 'Unified Perception Bus mandatory',
      },
      {
        activity: 'WhatsApp communication',
        constraints: ['HC-12', 'SC-01', 'AC-04'],
        behavior: 'All messages enter Bus; response time KPI daily',
      },
      {
        activity: 'Convert inquiry to booking',
        constraints: ['SC-05', 'DG-09', 'AC-05'],
        behavior: '3+ drop pattern triggers review',
      },
      {
        activity: 'Handle complaints',
        constraints: ['HC-03', 'SC-08', 'OVR-07'],
        behavior: 'Founder Intent alignment checked',
      },
      {
        activity: 'Process payments/discounts',
        constraints: ['DG-04', 'EB-02', 'OVR-02'],
        behavior: 'Auto-block discount >30%',
      },
      {
        activity: 'Schedule follow-ups',
        constraints: ['SC-01', 'HC-03', 'AC-06'],
        behavior: 'Automated reminders allowed',
      },
      {
        activity: 'Staff reception desk',
        constraints: ['EB-03', 'OVR-03', 'HC-08'],
        behavior: 'Staff reduction for revenue -> auto-block',
      },
      {
        activity: 'Handover between receptionists',
        constraints: ['SC-09', 'DG-09', 'OVR-03'],
        behavior: '7-day overlap rule',
      },
      {
        activity: 'Customer check-in/out',
        constraints: ['HC-12', 'SC-01', 'OVR-06'],
        behavior: 'IURG integrity maintained',
      },
      {
        activity: 'Escalate to management',
        constraints: ['DG-07', 'HC-03', 'OVR-08'],
        behavior: 'Evidence-based escalation',
      },
    ],
  },
  {
    id: 'commercial_growth',
    name: 'Commercial Growth',
    activities: [
      {
        activity: 'Design marketing campaign',
        constraints: ['HC-05', 'HC-11', 'DG-07'],
        behavior: 'Not commodity AI tool',
      },
      {
        activity: 'Set pricing/promotions',
        constraints: ['DG-04', 'EB-02', 'OVR-02'],
        behavior: '>30% discount -> CEO approval',
      },
      {
        activity: 'Customer acquisition',
        constraints: ['AC-06', 'SC-06', 'OVR-04'],
        behavior: 'Long-term prosperity > short-term volume',
      },
      {
        activity: 'Customer retention programs',
        constraints: ['AC-04', 'SC-05', 'OVR-02'],
        behavior: 'Founder patterns weighted',
      },
      {
        activity: 'Loyalty program design',
        constraints: ['HC-08', 'DG-04', 'AC-05'],
        behavior: 'Founder Intent alignment required',
      },
      {
        activity: 'Branch expansion decision',
        constraints: ['DG-03', 'HC-11', 'OVR-04'],
        behavior: 'Founder + Board approval',
      },
      {
        activity: 'Competitive response',
        constraints: ['HC-08', 'SC-08', 'AC-05'],
        behavior: 'Evidence hierarchy enforced',
      },
      {
        activity: 'Partnership evaluation',
        constraints: ['DG-03', 'HC-03', 'OVR-07'],
        behavior: 'All claims evidence-tiered',
      },
      {
        activity: 'Revenue optimization',
        constraints: ['EB-03', 'EB-02', 'OVR-02'],
        behavior: 'Never staff reduction for revenue',
      },
      {
        activity: 'Brand positioning',
        constraints: ['HC-05', 'AC-06', 'OVR-10'],
        behavior: 'Not generic AI positioning',
      },
    ],
  },
  {
    id: 'staff_performance',
    name: 'Staff Performance',
    activities: [
      {
        activity: 'Performance tracking',
        constraints: ['DG-02', 'OVR-03'],
        behavior: 'FI-2026-0034 enforced',
      },
      {
        activity: 'Training assignment',
        constraints: ['SC-12', 'HC-02'],
        behavior: 'Development preferred over replacement',
      },
      {
        activity: 'Shift optimization',
        constraints: ['EB-03'],
        behavior: 'Staff reduction for efficiency -> blocked',
      },
      {
        activity: 'Development plans',
        constraints: ['HC-02', 'SC-12'],
        behavior: 'Termination is last resort',
      },
    ],
  },
  {
    id: 'customer_retention',
    name: 'Customer Retention',
    activities: [
      {
        activity: 'Retention campaigns',
        constraints: ['DG-04', 'OVR-02'],
        behavior: 'FI-2026-0019 enforced',
      },
      {
        activity: 'Follow-up protocols',
        constraints: ['SC-01', 'DG-09'],
        behavior: 'Pattern validation required',
      },
      {
        activity: 'Satisfaction monitoring',
        constraints: ['OVR-07', 'EB-12'],
        behavior: 'Human-written responses required',
      },
      {
        activity: 'Win-back programs',
        constraints: ['SC-05', 'AC-04'],
        behavior: 'Evidence-based approach',
      },
    ],
  },
  {
    id: 'revenue_optimization',
    name: 'Revenue Optimization',
    activities: [
      {
        activity: 'Fee adjustments',
        constraints: ['DG-04', 'OVR-02'],
        behavior: 'FI-2026-0019: retention monitoring required',
      },
      {
        activity: 'Cost optimization (non-staff)',
        constraints: ['OVR-02', 'EB-03'],
        behavior: 'Staff-related cost cutting -> blocked',
      },
      {
        activity: 'Revenue analysis',
        constraints: ['HC-08', 'EB-03'],
        behavior: 'Revenue-first decision making -> blocked',
      },
      {
        activity: 'Pricing experiments',
        constraints: ['SC-09'],
        behavior: 'Temporal validation required',
      },
    ],
  },
  {
    id: 'medical_quality',
    name: 'Medical Quality',
    activities: [
      {
        activity: 'Protocol recommendations',
        constraints: ['DG-01', 'HC-02'],
        behavior: 'No autonomous medical decisions',
      },
      {
        activity: 'Outcome tracking',
        constraints: ['OVR-01', 'SC-08'],
        behavior: '2-source evidence required',
      },
      {
        activity: 'Quality monitoring',
        constraints: ['EB-02'],
        behavior: 'Quality compromise -> blocked',
      },
      {
        activity: 'Best practice research',
        constraints: ['HC-03'],
        behavior: 'Evidence-based only',
      },
    ],
  },
  {
    id: 'brand_reputation',
    name: 'Brand Reputation',
    activities: [
      {
        activity: 'Review response (human-written)',
        constraints: ['DG-11', 'EB-12'],
        behavior: 'AI-generated responses -> blocked',
      },
      {
        activity: 'Crisis communication',
        constraints: ['DG-03', 'SC-11'],
        behavior: 'Transparent, immediate, honest',
      },
      { activity: 'Brand monitoring', constraints: ['SC-11'], behavior: 'No cover-ups' },
      {
        activity: 'Positioning strategy',
        constraints: ['HC-05'],
        behavior: 'Not generic AI positioning',
      },
    ],
  },
  {
    id: 'branch_expansion',
    name: 'Branch Expansion',
    activities: [
      {
        activity: 'Expansion analysis',
        constraints: ['DG-03', 'SC-06'],
        behavior: 'Opening before excellence proven -> blocked',
      },
      {
        activity: 'Financial modeling',
        constraints: ['OVR-04', 'SC-06'],
        behavior: 'Cross-subsidy-dependent -> blocked',
      },
      {
        activity: 'Leadership identification',
        constraints: ['DG-02'],
        behavior: 'Opening without trained leadership -> blocked',
      },
      {
        activity: 'Site evaluation',
        constraints: ['HC-11'],
        behavior: 'Pre-loaded expansion Playbook required',
      },
    ],
  },
  {
    id: 'crisis_response',
    name: 'Crisis Response',
    activities: [
      {
        activity: 'Emergency protocol activation',
        constraints: ['DG-01', 'OR-01'],
        behavior: 'Normal constraints may be bypassed',
      },
      {
        activity: 'Crisis communication',
        constraints: ['SC-11', 'OVR-07'],
        behavior: 'Transparent only; Founder immediate notification',
      },
      {
        activity: 'Care stabilization',
        constraints: ['HC-08', 'EB-02'],
        behavior: 'Revenue-focused decisions -> blocked',
      },
      {
        activity: 'Rapid response',
        constraints: ['SC-11'],
        behavior: 'Delayed response -> blocked',
      },
    ],
  },
] as const;

export const PLAYBOOKS_BY_ID: ReadonlyMap<string, FicPlaybookMapping> = new Map(
  PLAYBOOK_CONSTRAINT_MAPPINGS.map((p) => [p.id, p]),
);

// ---------------------------------------------------------------------------
// Section 11 — SECH-FIC Check Sequence (13 steps)
// ---------------------------------------------------------------------------

export interface FicCheckStep {
  step: number;
  name: string;
  description: string;
}

export const SECH_FIC_CHECK_STEPS: readonly FicCheckStep[] = [
  { step: 1, name: 'IDENTIFY_SCOPE', description: 'Identify affected playbooks and domains.' },
  { step: 2, name: 'QUERY_INTENTS', description: 'Query FIC for applicable intents (by domain).' },
  {
    step: 3,
    name: 'ASSEMBLE_PAYLOAD',
    description: 'Assemble constraint payload (all HC, SC, AC, EB for these domains).',
  },
  {
    step: 4,
    name: 'DETECT_CONFLICTS',
    description: 'Check for intent conflicts (Conflict Resolution Engine — 7 classes).',
  },
  {
    step: 5,
    name: 'APPLY_HIERARCHY',
    description: 'If conflicts detected -> apply priority hierarchy (8 levels).',
  },
  {
    step: 6,
    name: 'EVALUATE_CONSTRAINTS',
    description: 'Evaluate all constraints against proposed action.',
  },
  {
    step: 7,
    name: 'AUTO_BLOCK',
    description: 'If EB triggered -> AUTO-BLOCK (no human needed to block).',
  },
  { step: 8, name: 'REJECT_HC', description: 'If HC violated -> REJECT with counter-proposal.' },
  { step: 9, name: 'FLAG_SC', description: 'If SC violated -> FLAG for documentation.' },
  { step: 10, name: 'REQUIRE_GATE', description: 'If DG threshold met -> REQUIRE human approval.' },
  { step: 11, name: 'ASSEMBLE_RESPONSE', description: 'Assemble approval/rejection response.' },
  { step: 12, name: 'WRITE_IURG', description: 'Write enforcement/violation event to IURG.' },
  {
    step: 13,
    name: 'RETURN_RESULT',
    description: 'Return result to SECH router (approved = continue, rejected = stop).',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 12 — IURG binding vocabulary
// ---------------------------------------------------------------------------

export const IURG_OBJECT_TYPES = [
  'INTENT',
  'CONSTRAINT',
  'CONFLICT',
  'OVERRIDE',
  'REVIEW',
  'AMENDMENT',
  'ENFORCEMENT',
  'VIOLATION',
] as const;

export const IURG_EDGE_TYPES = [
  'derived_from',
  'constrains',
  'conflicts_with',
  'supersedes',
  'enforced_by',
  'violated_by',
  'reviewed_under',
  'amended_by',
  'validated_by',
  'realized_as',
] as const;

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

/** True if the constraint applies to any of the given domains. */
export function constraintAppliesToDomains(
  constraint: FicConstraintDef,
  domains: string[],
): boolean {
  const cd = constraint.domains ?? [];
  if (cd.length === 0 || cd.includes('all')) {
    return true;
  }
  if (domains.length === 0) {
    return false;
  }
  const wanted = new Set(domains.map((d) => d.trim().toLowerCase()));
  return cd.some((d) => wanted.has(d.trim().toLowerCase()));
}

/** Resolve the constraint IDs mapped to the supplied playbooks. */
export function constraintIdsForPlaybooks(playbookIds: string[]): string[] {
  const ids = new Set<string>();
  for (const pid of playbookIds) {
    if (pid === 'all') {
      ALL_CONSTRAINTS.forEach((c) => ids.add(c.id));
      continue;
    }
    const pb = PLAYBOOKS_BY_ID.get(pid);
    if (!pb) {
      continue;
    }
    pb.activities.forEach((a) => a.constraints.forEach((c) => ids.add(c)));
  }
  return Array.from(ids);
}
