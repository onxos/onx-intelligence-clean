// ============================================================
// CONSTRAINED ZERO-INPUT (B7) — العقل الحضاري
// A suggestion generator that operates with NO external prompt: it
// turns patterns already produced by the merged layers into
// authority-classified proposals, then refuses to act above the
// autonomy ceiling.
//
//   signals (from B5 contradictions / B4 judgments / B8 events)
//     → classify authority via the REAL AuthorityGate (B3)
//     → status: AUTO_ELIGIBLE (≤A1) | REQUIRES_APPROVAL (>A1)
//     → persist with provenance (B4 MemoryStore)
//
// Hard constraint (fail-closed): the generator itself only ever
// PROPOSES (A0 observe / A1 suggest). Anything whose underlying
// action would need more than A1 is marked REQUIRES_APPROVAL and is
// NEVER auto-executed — there is no execution path in this module.
//
// Meta-metrics (deterministic, replayable): suggestion accuracy,
// confidence calibration, and acceptance drift.
//
// Builds on api/living-loop.ts patterns (extends, does not replace)
// and reuses B3 AuthorityGate, B4 MemoryStore, B5 reality-engine,
// B4 intelligence-object — integration, not duplication.
//
// Makes no mind-state claims. Pure classification + one engine class.
// ============================================================

import {
  AuthorityGate,
  authorityRank,
  AUTHORITY_LEVELS,
  type AuthorityLevel,
  type AuthorityDecision,
} from "./authority-gate";
import {
  InMemoryMemoryStore,
  type MemoryStore,
  type Provenance,
  type MemoryExport,
} from "./persistent-memory";
import type { Contradiction } from "./reality-engine";
import type { IntelligenceObject } from "./intelligence-object";

export type { Provenance } from "./persistent-memory";

/** The generator never proposes above this rung. Autonomy is capped at A1. */
export const SUGGESTION_CEILING: AuthorityLevel = "A1";

export class ZeroInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "ZeroInputError";
    this.code = code;
  }
}

export type SignalKind = "CONTRADICTION" | "EVENT_PATTERN" | "JUDGMENT";

export interface Signal {
  id: string;
  kind: SignalKind;
  summary: string;
  /** Salience of the pattern in [0,1] — drives confidence deterministically. */
  salience: number;
  /** The proposed follow-up action (text only — never executed here). */
  proposedAction: string;
  /** The authority level the proposed action WOULD require if carried out. */
  requiredAuthority: AuthorityLevel;
  provenance: Provenance;
}

export type SuggestionStatus = "AUTO_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface Suggestion {
  id: string;
  signalId: string;
  kind: SignalKind;
  action: string;
  requiredAuthority: AuthorityLevel;
  /** salience × provenance.confidence, clamped to [0,1]. */
  confidence: number;
  status: SuggestionStatus;
  /** Constitutional decision recorded by the real AuthorityGate (B3). */
  decision: AuthorityDecision;
  decisionReason: string;
  /** seq of the authority-chain record backing this suggestion. */
  authoritySeq: number;
  /**
   * Always false in B7: this module proposes but never executes. Kept
   * explicit so downstream governed executors cannot mistake a proposal
   * for a pre-authorised action.
   */
  autoExecutable: false;
  provenance: Provenance;
}

export type CalibrationBucket = "LOW" | "MODERATE" | "HIGH";

export interface CalibrationRow {
  bucket: CalibrationBucket;
  suggestions: number;
  feedback: number;
  accepted: number;
  /** accepted / feedback within this bucket, 0 when no feedback. */
  acceptRate: number;
}

export interface MetaMetrics {
  total: number;
  feedbackCount: number;
  accepted: number;
  rejected: number;
  /** accepted / feedbackCount, 0 when no feedback (never NaN). */
  accuracy: number;
  calibration: CalibrationRow[];
  /** secondHalfAcceptRate − firstHalfAcceptRate over feedback order; 0 when <2. */
  drift: number;
}

const SUGGESTION_KIND = "zero-input-suggestion";
const FEEDBACK_KIND = "zero-input-feedback";

function clamp01(n: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function isValidLevel(level: unknown): level is AuthorityLevel {
  return (
    typeof level === "string" &&
    (AUTHORITY_LEVELS as readonly string[]).includes(level)
  );
}

function bucketOf(confidence: number): CalibrationBucket {
  if (confidence < 0.4) return "LOW";
  if (confidence < 0.7) return "MODERATE";
  return "HIGH";
}

/** Pure ceiling check: ≤A1 is an auto-eligible proposal; anything above needs approval. */
export function classifyStatus(level: AuthorityLevel): SuggestionStatus {
  return authorityRank(level) <= authorityRank(SUGGESTION_CEILING)
    ? "AUTO_ELIGIBLE"
    : "REQUIRES_APPROVAL";
}

// ---------------------------------------------------------------
// ADAPTERS — turn merged-layer outputs into signals (integration)
// ---------------------------------------------------------------

/**
 * B5 (reality-engine): a detected contradiction becomes a signal. An
 * UNRESOLVED conflict cannot be adopted autonomously → needs human
 * authority (A2). A confidence/hierarchy-resolved one becomes an A1
 * "adopt the preferred fact" proposal.
 */
export function signalFromContradiction(
  c: Contradiction,
  provenance: Provenance,
): Signal {
  if (!c || typeof c !== "object") {
    throw new ZeroInputError("BAD_CONTRADICTION", "تعارض غير صالح.");
  }
  const resolved = c.resolution.preferred !== "NONE";
  const requiredAuthority: AuthorityLevel = resolved ? "A1" : "A2";
  const preferredObject =
    c.resolution.preferred === "A"
      ? c.objectA
      : c.resolution.preferred === "B"
        ? c.objectB
        : null;
  const action = resolved
    ? `اعتماد «${preferredObject}» لـ«${c.subject}» في «${c.predicate}» (${c.resolution.by})`
    : `عرض تعارض «${c.subject}» على مالك للبتّ (${c.kind})`;
  return {
    id: `sig-contra-${c.factA}-${c.factB}`,
    kind: "CONTRADICTION",
    summary: `تعارض ${c.kind} حول «${c.subject}»: «${c.objectA}» مقابل «${c.objectB}»`,
    salience: resolved ? 0.6 : 0.85,
    proposedAction: action,
    requiredAuthority,
    provenance,
  };
}

/**
 * B4 (intelligence-object): a rendered judgment becomes a signal.
 * SUPPORTED/REFUTED → an A1 reversible proposal; INCONCLUSIVE → an A0
 * observation to gather more evidence.
 */
export function signalFromJudgment(
  io: IntelligenceObject,
  provenance: Provenance,
): Signal {
  if (!io || !io.judgment) {
    throw new ZeroInputError("NO_JUDGMENT", "الكائن بلا حكم مُصدَر.");
  }
  const { verdict } = io.judgment;
  const requiredAuthority: AuthorityLevel = verdict === "INCONCLUSIVE" ? "A0" : "A1";
  const action =
    verdict === "SUPPORTED"
      ? `اقتراح العمل بموجب «${io.question}» (حكم مؤيَّد)`
      : verdict === "REFUTED"
        ? `اقتراح إسقاط «${io.question}» (حكم مدحوض)`
        : `اقتراح جمع أدلة إضافية حول «${io.question}» (غير حاسم)`;
  return {
    id: `sig-judg-${io.id}`,
    kind: "JUDGMENT",
    summary: `حكم ${verdict} على «${io.question}»`,
    salience: clamp01(io.judgment.confidence),
    proposedAction: action,
    requiredAuthority,
    provenance,
  };
}

export interface EventPattern {
  eventType: string;
  /** How many times the pattern was observed in the window. */
  count: number;
  /** Frequency at/above which the pattern implies a structural change (needs A2). */
  threshold: number;
}

/**
 * B8 (bridge-contracts activity): a recurring event pattern becomes a
 * signal. Below threshold → an A1 tuning proposal; at/above threshold →
 * a structural change that needs owner approval (A2).
 */
export function signalFromEventPattern(
  pattern: EventPattern,
  provenance: Provenance,
): Signal {
  if (!pattern || typeof pattern.eventType !== "string" || !pattern.eventType) {
    throw new ZeroInputError("BAD_PATTERN", "نمط حدث غير صالح.");
  }
  const structural = pattern.count >= pattern.threshold;
  const requiredAuthority: AuthorityLevel = structural ? "A2" : "A1";
  const denom = pattern.threshold > 0 ? pattern.threshold * 2 : 1;
  return {
    id: `sig-event-${pattern.eventType}`,
    kind: "EVENT_PATTERN",
    summary: `نمط «${pattern.eventType}» تكرر ${pattern.count} مرة`,
    salience: clamp01(pattern.count / denom),
    proposedAction: structural
      ? `عرض تغيير بنيوي مقترح لـ«${pattern.eventType}» على مالك`
      : `اقتراح ضبط تشغيلي لـ«${pattern.eventType}»`,
    requiredAuthority,
    provenance,
  };
}

// ---------------------------------------------------------------
// ENGINE
// ---------------------------------------------------------------

export interface ZeroInputOptions {
  gate?: AuthorityGate;
  store?: MemoryStore;
}

interface FeedbackEntry {
  suggestionId: string;
  accepted: boolean;
  order: number;
}

export class ZeroInputEngine {
  private readonly gate: AuthorityGate;
  private readonly store: MemoryStore;
  private readonly suggestions = new Map<string, Suggestion>();
  private readonly feedback = new Map<string, FeedbackEntry>();
  private feedbackOrder = 0;

  constructor(opts: ZeroInputOptions = {}) {
    this.gate = opts.gate ?? new AuthorityGate();
    this.store = opts.store ?? new InMemoryMemoryStore();
  }

  /** Generate authority-classified suggestions from signals. Fail-closed. */
  async generate(signals: Signal[]): Promise<Suggestion[]> {
    if (!Array.isArray(signals)) {
      throw new ZeroInputError("NOT_ARRAY", "دفعة الإشارات يجب أن تكون مصفوفة.");
    }
    const out: Suggestion[] = [];
    for (const sig of signals) {
      out.push(await this.generateOne(sig));
    }
    return out;
  }

  private async generateOne(sig: Signal): Promise<Suggestion> {
    if (!sig || typeof sig !== "object") {
      throw new ZeroInputError("BAD_SIGNAL", "إشارة غير صالحة.");
    }
    if (!sig.id || typeof sig.id !== "string") {
      throw new ZeroInputError("MISSING_ID", "كل إشارة تتطلب معرّفاً.");
    }
    if (typeof sig.proposedAction !== "string" || sig.proposedAction.trim() === "") {
      throw new ZeroInputError("MISSING_ACTION", `الإشارة ${sig.id} بلا إجراء مقترح.`);
    }
    if (!isValidLevel(sig.requiredAuthority)) {
      throw new ZeroInputError(
        "BAD_AUTHORITY",
        `مستوى صلاحية غير معروف في ${sig.id}: «${String(sig.requiredAuthority)}».`,
      );
    }
    this.validateProvenance(sig.id, sig.provenance);
    if (typeof sig.salience !== "number" || sig.salience < 0 || sig.salience > 1) {
      throw new ZeroInputError("BAD_SALIENCE", `salience خارج [0,1] في ${sig.id}.`);
    }

    // Record the constitutional decision on the tamper-evident chain (B3).
    const record = this.gate.request({
      subject: "zero-input-generator",
      action: sig.proposedAction,
      requested: sig.requiredAuthority,
    });

    const status = classifyStatus(sig.requiredAuthority);
    const confidence = clamp01(sig.salience * sig.provenance.confidence);
    const suggestion: Suggestion = {
      id: `sug-${sig.id}`,
      signalId: sig.id,
      kind: sig.kind,
      action: sig.proposedAction,
      requiredAuthority: sig.requiredAuthority,
      confidence,
      status,
      decision: record.decision,
      decisionReason: record.reason,
      authoritySeq: record.seq,
      autoExecutable: false,
      provenance: sig.provenance,
    };

    await this.store.put({
      id: suggestion.id,
      kind: SUGGESTION_KIND,
      content: JSON.stringify({
        signalId: suggestion.signalId,
        kind: suggestion.kind,
        action: suggestion.action,
        requiredAuthority: suggestion.requiredAuthority,
        confidence: suggestion.confidence,
        status: suggestion.status,
        decision: suggestion.decision,
        authoritySeq: suggestion.authoritySeq,
      }),
      provenance: sig.provenance,
    });
    this.suggestions.set(suggestion.id, suggestion);
    return suggestion;
  }

  private validateProvenance(id: string, p: Provenance | undefined): void {
    if (
      !p ||
      typeof p !== "object" ||
      !p.source ||
      !p.method ||
      !p.recordedAt ||
      typeof p.confidence !== "number" ||
      p.confidence < 0 ||
      p.confidence > 1
    ) {
      throw new ZeroInputError("BAD_PROVENANCE", `provenance ناقص/غير صالح في ${id}.`);
    }
  }

  /** Record human feedback (accept/reject) for a suggestion. Fail-closed, no duplicates. */
  async recordFeedback(
    suggestionId: string,
    accepted: boolean,
    provenance: Provenance,
  ): Promise<void> {
    if (!this.suggestions.has(suggestionId)) {
      throw new ZeroInputError(
        "SUGGESTION_NOT_FOUND",
        `لا يوجد اقتراح ${suggestionId}.`,
      );
    }
    if (this.feedback.has(suggestionId)) {
      throw new ZeroInputError(
        "DUPLICATE_FEEDBACK",
        `تغذية راجعة مكررة للاقتراح ${suggestionId}.`,
      );
    }
    this.validateProvenance(suggestionId, provenance);
    const order = this.feedbackOrder++;
    this.feedback.set(suggestionId, { suggestionId, accepted, order });
    await this.store.put({
      id: `fb-${suggestionId}`,
      kind: FEEDBACK_KIND,
      content: JSON.stringify({ suggestionId, accepted, order }),
      provenance,
    });
  }

  /** Deterministic meta-metrics over all suggestions and feedback so far. */
  metrics(): MetaMetrics {
    const suggestions = [...this.suggestions.values()];
    const feedback = [...this.feedback.values()].sort((a, b) => a.order - b.order);
    const accepted = feedback.filter((f) => f.accepted).length;
    const rejected = feedback.length - accepted;
    const accuracy = feedback.length === 0 ? 0 : accepted / feedback.length;

    const calibration: CalibrationRow[] = (["LOW", "MODERATE", "HIGH"] as CalibrationBucket[]).map(
      (bucket) => {
        const inBucket = suggestions.filter((s) => bucketOf(s.confidence) === bucket);
        const ids = new Set(inBucket.map((s) => s.id));
        const fb = feedback.filter((f) => ids.has(f.suggestionId));
        const acc = fb.filter((f) => f.accepted).length;
        return {
          bucket,
          suggestions: inBucket.length,
          feedback: fb.length,
          accepted: acc,
          acceptRate: fb.length === 0 ? 0 : acc / fb.length,
        };
      },
    );

    let drift = 0;
    if (feedback.length >= 2) {
      const mid = Math.floor(feedback.length / 2);
      const first = feedback.slice(0, mid);
      const second = feedback.slice(mid);
      const rate = (arr: FeedbackEntry[]): number =>
        arr.length === 0 ? 0 : arr.filter((f) => f.accepted).length / arr.length;
      drift = rate(second) - rate(first);
    }

    return {
      total: suggestions.length,
      feedbackCount: feedback.length,
      accepted,
      rejected,
      accuracy,
      calibration,
      drift,
    };
  }

  /** Full audit export (suggestions + feedback) from the B4 MemoryStore. */
  export(): Promise<MemoryExport> {
    return this.store.export();
  }

  listSuggestions(): Suggestion[] {
    return [...this.suggestions.values()];
  }

  /** Inspect the tamper-evident authority chain backing the suggestions. */
  authorityChain(): ReturnType<AuthorityGate["exportChain"]> {
    return this.gate.exportChain();
  }
}
