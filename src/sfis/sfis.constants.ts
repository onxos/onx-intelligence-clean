/**
 * IW-28 — SFIS Strategic Founder Intelligence Shield (HC-05, HC-06, HC-11).
 *
 * Pure, side-effect-free detection engine that guards ONX outputs and
 * architecture decisions against scope convergence to commodity AI (HC-05) and
 * verifies mandatory Frontier AI availability (HC-06).
 */

// ---------------------------------------------------------------------------
// HC-06 — the 6 mandatory frontier cognitive engines
// ---------------------------------------------------------------------------

export const FRONTIER_MODELS = ['gpt', 'claude', 'gemini', 'deepseek', 'qwen', 'llama'] as const;
export type FrontierModel = (typeof FRONTIER_MODELS)[number];

export const MODEL_STATES = ['available', 'degraded', 'unavailable', 'unknown'] as const;
export type ModelState = (typeof MODEL_STATES)[number];

/** A model counts toward HC-06 compliance only when available AND config-valid. */
export function isModelCompliant(status: string, configValid: boolean): boolean {
  return status === 'available' && configValid === true;
}

// ---------------------------------------------------------------------------
// HC-05 — commodity AI categories + detection patterns
// ---------------------------------------------------------------------------

export const COMMODITY_CATEGORIES = [
  'chatbot',
  'copilot',
  'rag',
  'vector-db',
  'decision-support',
] as const;
export type CommodityCategory = (typeof COMMODITY_CATEGORIES)[number];

export type SfisVerdict = 'PASS' | 'FLAG' | 'REJECT';

interface CommodityPatternDef {
  category: CommodityCategory;
  label: string;
  patterns: RegExp[];
  reason: string;
}

/**
 * Strong commodity-convergence signals. Kept deliberately specific to avoid
 * false positives on legitimate ONX outputs (SFIS OVER-SENSITIVE guard).
 */
export const COMMODITY_PATTERNS: readonly CommodityPatternDef[] = [
  {
    category: 'chatbot',
    label: 'Chatbot',
    patterns: [/\bchat\s?bot\b/i, /conversational[- ]only/i, /just a (chat\s?bot|conversation)/i],
    reason: 'Conversational-only convergence — no institutional reasoning (HC-05).',
  },
  {
    category: 'copilot',
    label: 'Copilot',
    patterns: [/\bco-?pilot\b/i, /passive assistant/i, /autocomplete assistant/i],
    reason: 'Passive assistant convergence — no autonomous judgment (HC-05).',
  },
  {
    category: 'rag',
    label: 'RAG platform',
    patterns: [
      /\brag\s+(platform|pipeline|system|app)\b/i,
      /retrieval[- ]only/i,
      /retrieval[- ]augmented[- ]generation/i,
    ],
    reason: 'Retrieval-only convergence — no understanding layer (HC-05).',
  },
  {
    category: 'vector-db',
    label: 'Vector DB',
    patterns: [/\bvector\s+(db|database|store)\b/i, /storage[- ]only/i, /embeddings? store/i],
    reason: 'Storage-only convergence — no knowledge graph (HC-05).',
  },
  {
    category: 'decision-support',
    label: 'Decision support tool',
    patterns: [/decision[- ]support (tool|system|software)/i, /recommendations[- ]only/i],
    reason: 'Recommendations-only convergence — no execution (HC-05).',
  },
];

/** Generic-branding signals that FLAG (require human review) rather than REJECT. */
export const GENERIC_BRANDING_PATTERNS: readonly RegExp[] = [
  /\bai[- ]powered\b/i,
  /\bai[- ]driven\b/i,
  /\bsmart\b/i,
  /\bintelligent\b/i,
  /\bnext[- ]gen(eration)? ai\b/i,
];

/** ONX-specific markers that establish institutional identity (suppress false positives). */
export const ONX_SPECIFIC_PATTERNS: readonly RegExp[] = [
  /\bonx\b/i,
  /institutional (intelligence|understanding|judgment|memory)/i,
  /founder intent/i,
  /constitutional/i,
  /\biurg\b/i,
  /perception bus/i,
  /decision ladder/i,
];

/** Categories that, when proposed explicitly, are auto-rejected. */
const REJECT_CATEGORY_ALIASES: Record<string, CommodityCategory> = {
  chatbot: 'chatbot',
  copilot: 'copilot',
  'co-pilot': 'copilot',
  rag: 'rag',
  'rag-platform': 'rag',
  'vector-db': 'vector-db',
  vector_db: 'vector-db',
  vectordb: 'vector-db',
  'decision-support': 'decision-support',
  decision_support: 'decision-support',
};

// ---------------------------------------------------------------------------
// L1 — output classification
// ---------------------------------------------------------------------------

export interface SfisClassification {
  verdict: SfisVerdict;
  layer: 'L1' | 'L2';
  detectedCategory: string | null;
  reason: string;
  matchedPatterns: string[];
  driftScore?: number;
}

export function matchesAny(text: string, patterns: readonly RegExp[]): RegExp[] {
  return patterns.filter((p) => p.test(text));
}

export function hasOnxIdentity(text: string): boolean {
  return ONX_SPECIFIC_PATTERNS.some((p) => p.test(text));
}

/** L1: classify an output against the HC-05 commodity categories. */
export function classifyOutput(
  outputText: string | undefined,
  proposedCategory?: string,
): SfisClassification {
  const text = outputText ?? '';

  // Explicit proposed commodity category -> immediate REJECT.
  const alias = proposedCategory
    ? REJECT_CATEGORY_ALIASES[proposedCategory.trim().toLowerCase()]
    : undefined;
  if (alias) {
    const def = COMMODITY_PATTERNS.find((d) => d.category === alias)!;
    return {
      verdict: 'REJECT',
      layer: 'L1',
      detectedCategory: alias,
      reason: `Proposed as "${proposedCategory}": ${def.reason}`,
      matchedPatterns: [`proposedCategory:${proposedCategory}`],
    };
  }

  // Scan the text for strong commodity signals.
  const detected: { category: CommodityCategory; reason: string; matched: string[] }[] = [];
  for (const def of COMMODITY_PATTERNS) {
    const hits = matchesAny(text, def.patterns);
    if (hits.length > 0) {
      detected.push({
        category: def.category,
        reason: def.reason,
        matched: hits.map((r) => r.source),
      });
    }
  }
  if (detected.length > 0) {
    const first = detected[0];
    return {
      verdict: 'REJECT',
      layer: 'L1',
      detectedCategory: detected.map((d) => d.category).join(','),
      reason: first.reason,
      matchedPatterns: detected.flatMap((d) => d.matched),
    };
  }

  // Generic branding without ONX identity -> FLAG for human review.
  const genericHits = matchesAny(text, GENERIC_BRANDING_PATTERNS);
  if (genericHits.length > 0 && !hasOnxIdentity(text)) {
    return {
      verdict: 'FLAG',
      layer: 'L1',
      detectedCategory: 'generic',
      reason: 'Generic AI branding without ONX specificity — requires human review (HC-05).',
      matchedPatterns: genericHits.map((r) => r.source),
    };
  }

  return {
    verdict: 'PASS',
    layer: 'L1',
    detectedCategory: null,
    reason: 'ONX-specific / institutional output — no commodity convergence detected.',
    matchedPatterns: [],
  };
}

// ---------------------------------------------------------------------------
// L2 — architecture drift
// ---------------------------------------------------------------------------

/** L2: detect whether a proposed architecture reduces ONX to commodity AI. */
export function detectArchitectureDrift(
  description: string | undefined,
  proposedCategory?: string,
): SfisClassification {
  const text = description ?? '';
  const alias = proposedCategory
    ? REJECT_CATEGORY_ALIASES[proposedCategory.trim().toLowerCase()]
    : undefined;

  const detectedCategories: string[] = [];
  const matched: string[] = [];
  for (const def of COMMODITY_PATTERNS) {
    const hits = matchesAny(text, def.patterns);
    if (hits.length > 0) {
      detectedCategories.push(def.category);
      matched.push(...hits.map((r) => r.source));
    }
  }
  if (alias && !detectedCategories.includes(alias)) {
    detectedCategories.push(alias);
    matched.push(`proposedCategory:${proposedCategory}`);
  }

  const onx = hasOnxIdentity(text);
  // Drift score: fraction of commodity categories present in the architecture.
  const driftScore = Math.max(
    0,
    Math.min(1, detectedCategories.length / COMMODITY_PATTERNS.length),
  );

  // For architecture, ANY commodity convergence signal is drift (institutional
  // scope must be preserved). ONX identity does not excuse a commodity design.
  if (detectedCategories.length > 0) {
    return {
      verdict: 'REJECT',
      layer: 'L2',
      detectedCategory: detectedCategories.join(','),
      reason: `Architecture drift toward commodity AI (${detectedCategories.join(', ')}) — blocked at DG-07 (HC-05).`,
      matchedPatterns: matched,
      driftScore,
    };
  }

  return {
    verdict: 'PASS',
    layer: 'L2',
    detectedCategory: null,
    reason: onx
      ? 'Architecture preserves ONX institutional scope — no drift detected.'
      : 'No commodity convergence detected in the architecture.',
    matchedPatterns: [],
    driftScore,
  };
}
