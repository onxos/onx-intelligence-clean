// ============================================================
// MIND TICK — G6 "دورة العقل الحية" (living mind cycle)
//
// Deterministic, propose-only cycle that operationally connects the
// upper mind layers to the LIVE platform inbox. Until now B5
// (reality-engine) and B7 (zero-input) were pure engines fed only by
// tRPC callers; no production path fed them from real events. This
// module closes that gap by replaying the inbox through the merged
// layers — reuse only, zero copied logic:
//
//   getEventsAfterId (inbox read, OWN cursor — never touches the
//     perception adapter's cursor or state)
//   → replayContract: B8 seedInstitutionalSchemas + validateEvent
//     (contract replay at read time — unknown types / broken identity
//     rows are skipped fail-closed, counted, and stepped past)
//   → toMindInput: row → B5 RawInput with an explicit triple
//     (subject = aggregateType#aggregateId, predicate = "status-of",
//     object = final eventType segment) and a POINT validity scope at
//     the event instant, so states at different moments coexist and
//     only same-instant conflicting states contradict
//   → runRealityPipeline (B5) → contradictions → signalFromContradiction
//   → deterministic event-type recurrence → signalFromEventPattern
//   → ZeroInputEngine.generate (B7): authority-classified PROPOSALS
//     through the real AuthorityGate (B3). Ceiling A1; anything above
//     is REQUIRES_APPROVAL; autoExecutable is always false — there is
//     NO execution path anywhere in this module.
//
// Determinism: every derived value (ids, provenance, salience,
// confidence) comes from event fields and documented constants.
// No Math.random. No Date.now in decision logic — the wall clock is
// an injectable parameter used ONLY for the lastRunAt counter, and the
// cycle's ranAt stamp, never for any decision.
//
// No self-trigger loop: the cycle READS the inbox and produces
// in-memory proposals + counters. It never writes events back to the
// inbox, so its own output can never re-enter its input.
//
// SAFETY: like runPerceptionSyncTick, runMindTick NEVER throws. A pg
// failure is a silent skip; a malformed row bumps skipped counters.
// ============================================================

import { getEventsAfterId, type PerceptionSourceRow } from "./platform-inbox-store";
import {
  seedInstitutionalSchemas,
  validateEvent,
  type BridgeEvent,
  type ValidationResult,
} from "./bridge-contracts";
import {
  runRealityPipeline,
  defaultOntology,
  type Ontology,
  type RawInput,
} from "./reality-engine";
import {
  ZeroInputEngine,
  signalFromContradiction,
  signalFromEventPattern,
  SUGGESTION_CEILING,
  type Signal,
  type Suggestion,
  type EventPattern,
} from "./zero-input";
import type { Provenance } from "./persistent-memory";

/** Cycle budget: at most this many inbox rows are read per tick. */
export const MIND_TICK_BATCH_LIMIT = 200;

/**
 * Documented constant confidence for facts derived from the inbox:
 * events arrive over the authenticated bridge and pass the B8 contract,
 * but the mind only sees identity fields (payload values never leave
 * Postgres) — hence high-but-not-certain, matching the perception
 * adapter's trust level for the same feed.
 */
export const MIND_TICK_SOURCE_CONFIDENCE = 0.8;

/**
 * Documented recurrence threshold: an event type must appear at least
 * this many times within one batch to register as an EVENT_PATTERN
 * signal (below it, repetition is noise, not a pattern).
 */
export const MIND_TICK_PATTERN_MIN = 3;

/**
 * Documented structural threshold handed to signalFromEventPattern:
 * at/above this per-batch count the pattern implies a structural
 * change (A2, owner approval); below it, an A1 tuning proposal.
 */
export const MIND_TICK_PATTERN_STRUCTURAL_THRESHOLD = 10;

const MAX_ERROR_LENGTH = 200;

/** status-of is functional: one aggregate cannot hold two different
 *  states at the same instant — that is exactly a contradiction. */
function mindTickOntology(): Ontology {
  const ontology = defaultOntology();
  ontology.predicates["status-of"] = { functional: true };
  return ontology;
}

export interface MindTickStatus {
  lastProcessedId: number;
  processedTotal: number;
  validTotal: number;
  skippedTotal: number;
  contradictionsTotal: number;
  patternsTotal: number;
  suggestionsTotal: number;
  requiresApprovalTotal: number;
  autoEligibleTotal: number;
  ticksTotal: number;
  ticksSkipped: number;
  lastRunAt: string | null;
  lastError: string | null;
  batchLimit: number;
  /** The B7 autonomy ceiling — pinned so the surface itself documents it. */
  ceiling: typeof SUGGESTION_CEILING;
}

export interface MindTickResult {
  ranAt: string;
  read: number;
  valid: number;
  skipped: number;
  contradictions: number;
  patterns: EventPattern[];
  signals: number;
  /** true when the batch produced no signal at all — the honest verdict
   *  is "not enough data", never a fabricated proposal. */
  insufficientData: boolean;
  suggestions: Suggestion[];
}

const state = {
  lastProcessedId: 0,
  processedTotal: 0,
  validTotal: 0,
  skippedTotal: 0,
  contradictionsTotal: 0,
  patternsTotal: 0,
  suggestionsTotal: 0,
  requiresApprovalTotal: 0,
  autoEligibleTotal: 0,
  ticksTotal: 0,
  ticksSkipped: 0,
  lastRunAt: null as string | null,
  lastError: null as string | null,
  running: false,
};

let lastResult: MindTickResult | null = null;

export type Clock = () => Date;

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * B8 contract replay at read time — the SAME fail-closed validateEvent
 * used by the live ingest gate (G1), no copied checks. Rows written
 * before the gate existed (or with a broken identity) are rejected here.
 * Payload values never leave Postgres, so the replayed event carries an
 * empty payload — the v1 identity contract has no required payload field.
 */
export function replayContract(row: PerceptionSourceRow): ValidationResult {
  seedInstitutionalSchemas(); // idempotent — same seam admitLiveEvent uses
  const event: BridgeEvent = {
    source: row.source,
    eventId: row.eventId,
    eventType: row.eventType,
    aggregateType: row.aggregateType as string,
    aggregateId: row.aggregateId as string,
    occurredAt: row.occurredAt as string,
    payload: {},
  };
  return validateEvent(event);
}

/**
 * Pure transform: validated inbox row → B5 RawInput.
 * - id derives from source+eventId → idempotent correlation on replay.
 * - Explicit triple (extraction certainty 1.0):
 *     aggregateType#aggregateId --status-of--> <final eventType segment>
 * - POINT validity scope at the event instant: states at different
 *   moments coexist; only same-instant conflicting states contradict.
 * - Deterministic provenance from event fields only.
 */
export function toMindInput(row: PerceptionSourceRow): RawInput {
  const instant = (row.occurredAt ?? row.receivedAt) as string;
  const segments = row.eventType.split(".");
  return {
    id: `mind-${sanitizeIdPart(row.source)}-${row.eventId}`,
    triple: {
      subject: `${row.aggregateType}#${row.aggregateId}`,
      predicate: "status-of",
      object: segments[segments.length - 1],
    },
    validityScope: { from: instant, to: instant },
    provenance: {
      source: "platform-inbox",
      method: "mind-tick",
      recordedAt: instant,
      confidence: MIND_TICK_SOURCE_CONFIDENCE,
    },
  };
}

/** Deterministic recurrence detection over the valid rows of ONE batch. */
function detectPatterns(rows: PerceptionSourceRow[]): EventPattern[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.eventType, (counts.get(row.eventType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIND_TICK_PATTERN_MIN)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([eventType, count]) => ({
      eventType,
      count,
      threshold: MIND_TICK_PATTERN_STRUCTURAL_THRESHOLD,
    }));
}

/** Batch provenance: recordedAt = the latest event instant in the batch
 *  (all instants are normalized ISO strings, so lexicographic max works). */
function batchProvenance(rows: PerceptionSourceRow[]): Provenance {
  let latest = "";
  for (const row of rows) {
    const instant = (row.occurredAt ?? row.receivedAt) as string;
    if (instant > latest) latest = instant;
  }
  return {
    source: "platform-inbox",
    method: "mind-tick",
    recordedAt: latest,
    confidence: MIND_TICK_SOURCE_CONFIDENCE,
  };
}

function emptyResult(ranAt: string): MindTickResult {
  return {
    ranAt,
    read: 0,
    valid: 0,
    skipped: 0,
    contradictions: 0,
    patterns: [],
    signals: 0,
    insufficientData: true,
    suggestions: [],
  };
}

/**
 * One living-mind cycle. NEVER throws — every failure is absorbed into
 * the counters, exactly like runPerceptionSyncTick.
 * @param clock injectable wall clock — used ONLY for run timestamps
 *              (lastRunAt / ranAt), never in decision logic.
 */
export async function runMindTick(clock: Clock = () => new Date()): Promise<MindTickResult> {
  const ranAt = clock().toISOString();
  if (state.running) return lastResult ?? emptyResult(ranAt);
  state.running = true;
  try {
    state.ticksTotal += 1;
    state.lastRunAt = ranAt;

    let rows: PerceptionSourceRow[];
    try {
      rows = await getEventsAfterId(state.lastProcessedId, MIND_TICK_BATCH_LIMIT);
    } catch (error) {
      // pg unavailable (no DATABASE_URL locally, network blip…) → silent skip
      state.ticksSkipped += 1;
      state.lastError = truncateError(error);
      return emptyResult(ranAt);
    }

    // (1) Contract replay: fail-closed per-row admission via B8.
    const valid: PerceptionSourceRow[] = [];
    let skipped = 0;
    for (const row of rows) {
      const admissible =
        Number.isFinite(row.id) &&
        typeof row.source === "string" &&
        row.source.length > 0 &&
        replayContract(row).valid;
      if (admissible) valid.push(row);
      else skipped += 1;
      state.processedTotal += 1;
      if (Number.isFinite(row.id)) {
        state.lastProcessedId = Math.max(state.lastProcessedId, row.id);
      }
    }
    state.validTotal += valid.length;
    state.skippedTotal += skipped;

    // (2)–(5) B5 pipeline → signals → B7 proposals. Any engine-level
    // throw is absorbed: the cursor already advanced, nothing escapes.
    let contradictionsCount = 0;
    let patterns: EventPattern[] = [];
    let suggestions: Suggestion[] = [];
    let signalsCount = 0;
    try {
      const provenance = batchProvenance(valid);
      const inputs = valid.map(toMindInput);
      const report = runRealityPipeline(inputs, mindTickOntology());
      contradictionsCount = report.contradictions.length;

      const signals: Signal[] = report.contradictions.map((c) =>
        signalFromContradiction(c, provenance),
      );
      patterns = detectPatterns(valid);
      for (const pattern of patterns) {
        signals.push(signalFromEventPattern(pattern, provenance));
      }
      signalsCount = signals.length;

      // Fresh engine per cycle: keyless, in-memory, bounded — and every
      // suggestion passes the REAL AuthorityGate (B3). Propose-only.
      const engine = new ZeroInputEngine();
      suggestions = await engine.generate(signals);
    } catch (error) {
      state.lastError = truncateError(error);
    }

    state.contradictionsTotal += contradictionsCount;
    state.patternsTotal += patterns.length;
    state.suggestionsTotal += suggestions.length;
    for (const s of suggestions) {
      if (s.status === "REQUIRES_APPROVAL") state.requiresApprovalTotal += 1;
      else state.autoEligibleTotal += 1;
    }

    lastResult = {
      ranAt,
      read: rows.length,
      valid: valid.length,
      skipped,
      contradictions: contradictionsCount,
      patterns,
      signals: signalsCount,
      insufficientData: signalsCount === 0,
      suggestions,
    };
    return lastResult;
  } catch (error) {
    // Belt and braces: nothing above should throw, but nothing may escape.
    state.lastError = truncateError(error);
    return emptyResult(ranAt);
  } finally {
    state.running = false;
  }
}

/** Counters only — no event payloads or contents are ever exposed here. */
export function getMindTickStatus(): MindTickStatus {
  return {
    lastProcessedId: state.lastProcessedId,
    processedTotal: state.processedTotal,
    validTotal: state.validTotal,
    skippedTotal: state.skippedTotal,
    contradictionsTotal: state.contradictionsTotal,
    patternsTotal: state.patternsTotal,
    suggestionsTotal: state.suggestionsTotal,
    requiresApprovalTotal: state.requiresApprovalTotal,
    autoEligibleTotal: state.autoEligibleTotal,
    ticksTotal: state.ticksTotal,
    ticksSkipped: state.ticksSkipped,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    batchLimit: MIND_TICK_BATCH_LIMIT,
    ceiling: SUGGESTION_CEILING,
  };
}

/** Audit surface: the latest full cycle result (proposals + evidence). */
export function getLastMindTickResult(): MindTickResult | null {
  return lastResult;
}

// Test-only: reset cursor/counters/last result
export function __resetMindTickForTests(): void {
  state.lastProcessedId = 0;
  state.processedTotal = 0;
  state.validTotal = 0;
  state.skippedTotal = 0;
  state.contradictionsTotal = 0;
  state.patternsTotal = 0;
  state.suggestionsTotal = 0;
  state.requiresApprovalTotal = 0;
  state.autoEligibleTotal = 0;
  state.ticksTotal = 0;
  state.ticksSkipped = 0;
  state.lastRunAt = null;
  state.lastError = null;
  state.running = false;
  lastResult = null;
}
