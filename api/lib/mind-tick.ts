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
// FAIL-CLOSED, NOT FAIL-SILENT:
//   - runMindTick NEVER throws (cron-safe like runPerceptionSyncTick),
//     but nothing is lost silently: a malformed row is written to a
//     DURABLE quarantine (DLQ, B4 MemoryStore) with rejection reasons
//     and an idempotent correlation id BEFORE the cursor may advance
//     past it. If the quarantine write fails, the cursor HALTS at that
//     row and the rest of the batch is deferred to the next tick.
//   - The cursor advances only past rows with a processed or
//     durably-quarantined outcome. Replay after a restart re-hits the
//     same quarantine ids (DUPLICATE = already durable = advance).
//   - A pg read failure is a counted, structured-logged skip.
//   - Cron-level failures are recorded via recordMindTickCronFailure:
//     structured JSON log + cronFailures metric + lastCronError
//     readiness evidence in the status surface. Never a bare console
//     line that nobody counts.
//
// LEASE: an in-process lease (holder + acquiredAt) guards the cycle —
// overlapping ticks are rejected and counted (leaseRejected), never
// interleaved. Single-runtime by design, same execution model as the
// perception adapter's cron.
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
import {
  createMemoryStore,
  MemoryError,
  type MemoryStore,
  type MemoryRecord,
} from "./persistent-memory";

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

/** B4 memory kind under which quarantined (DLQ) rows are stored. */
export const MIND_TICK_QUARANTINE_KIND = "mind-tick-quarantine";

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
  quarantinedTotal: number;
  quarantineFailures: number;
  contradictionsTotal: number;
  patternsTotal: number;
  suggestionsTotal: number;
  requiresApprovalTotal: number;
  autoEligibleTotal: number;
  ticksTotal: number;
  ticksSkipped: number;
  leaseRejected: number;
  cronFailures: number;
  lastCronError: string | null;
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
  /** Malformed rows durably quarantined (DLQ) this cycle — never lost. */
  quarantined: number;
  /** true when a quarantine write failed: the cursor HALTED at that row. */
  halted: boolean;
  /** Rows left unprocessed because of a halt — retried next tick. */
  deferred: number;
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
  quarantinedTotal: 0,
  quarantineFailures: 0,
  contradictionsTotal: 0,
  patternsTotal: 0,
  suggestionsTotal: 0,
  requiresApprovalTotal: 0,
  autoEligibleTotal: 0,
  ticksTotal: 0,
  ticksSkipped: 0,
  leaseRejected: 0,
  cronFailures: 0,
  lastCronError: null as string | null,
  lastRunAt: null as string | null,
  lastError: null as string | null,
};

/** In-process lease guarding the cycle — overlapping ticks are rejected
 *  and counted, never interleaved. Single-runtime execution model, same
 *  as the perception adapter's cron. */
const lease = {
  held: false,
  holder: null as string | null,
  acquiredAt: null as string | null,
};

/** Durable quarantine (DLQ) store — pg-backed via DATABASE_URL when
 *  configured (B4 PgVectorMemoryStore), else in-memory. Lazy singleton. */
let quarantineStore: MemoryStore | null = null;

function getQuarantineStore(): MemoryStore {
  if (!quarantineStore) quarantineStore = createMemoryStore();
  return quarantineStore;
}

let lastResult: MindTickResult | null = null;

export type Clock = () => Date;

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/** Structured, machine-parsable error line — never a bare string that
 *  nobody counts. Every call site also bumps a metric counter. */
function logStructured(event: string, detail: Record<string, unknown>): void {
  console.error(JSON.stringify({ module: "mind-tick", event, ...detail }));
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
    quarantined: 0,
    halted: false,
    deferred: 0,
    contradictions: 0,
    patterns: [],
    signals: 0,
    insufficientData: true,
    suggestions: [],
  };
}

/**
 * Idempotent quarantine correlation id: derived from the row's own
 * identity when present, else from the deterministic batch position
 * after the current cursor — identical on every replay of the batch.
 */
export function quarantineCorrelationId(
  row: PerceptionSourceRow,
  cursor: number,
  position: number,
): string {
  if (typeof row.source === "string" && row.source.length > 0 && row.eventId != null) {
    return `qtn-${sanitizeIdPart(row.source)}-${row.eventId}`;
  }
  if (Number.isFinite(row.id)) return `qtn-row-${row.id}`;
  return `qtn-cursor-${cursor}-pos-${position}`;
}

/**
 * Durable quarantine (DLQ) write for a malformed row — MUST succeed (or
 * already exist) BEFORE the cursor may advance past the row. Returns
 * true when the row is durably quarantined; false when the write failed
 * (caller halts the cursor at this row — nothing is lost silently).
 * A DUPLICATE means an earlier tick/restart already quarantined this
 * exact row — idempotent replay, already durable, safe to advance.
 */
async function quarantineRow(
  row: PerceptionSourceRow,
  validation: ValidationResult | null,
  correlationId: string,
): Promise<boolean> {
  const reasons = validation
    ? validation.errors.map((e) => `${e.field}:${e.code}`)
    : ["row:STRUCTURAL_INVALID"];
  const recordedAt =
    (typeof row.occurredAt === "string" && row.occurredAt) ||
    (typeof row.receivedAt === "string" && row.receivedAt) ||
    "1970-01-01T00:00:00.000Z";
  try {
    await getQuarantineStore().put({
      id: correlationId,
      kind: MIND_TICK_QUARANTINE_KIND,
      // Identity fields + rejection reasons only — payload values never
      // leave Postgres, so nothing sensitive can land in the DLQ.
      content: JSON.stringify({
        correlationId,
        rowId: Number.isFinite(row.id) ? row.id : null,
        source: typeof row.source === "string" ? row.source : null,
        eventId: row.eventId ?? null,
        eventType: typeof row.eventType === "string" ? row.eventType : null,
        reasons,
      }),
      provenance: {
        source: "platform-inbox",
        method: "mind-tick-quarantine",
        recordedAt,
        confidence: 1,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof MemoryError && error.code === "DUPLICATE") return true;
    state.quarantineFailures += 1;
    state.lastError = truncateError(error);
    logStructured("quarantine-write-failed", {
      correlationId,
      error: truncateError(error),
    });
    return false;
  }
}

/**
 * One living-mind cycle. NEVER throws — every failure is absorbed into
 * counters + structured logs, and malformed rows land in the durable
 * quarantine BEFORE the cursor advances. Guarded by an in-process
 * lease: overlapping calls are rejected and counted, never interleaved.
 * @param clock injectable wall clock — used ONLY for run/lease
 *              timestamps (lastRunAt / ranAt), never in decision logic.
 */
export async function runMindTick(clock: Clock = () => new Date()): Promise<MindTickResult> {
  const ranAt = clock().toISOString();
  if (lease.held) {
    state.leaseRejected += 1;
    logStructured("lease-rejected", { holder: lease.holder, acquiredAt: lease.acquiredAt });
    return lastResult ?? emptyResult(ranAt);
  }
  lease.held = true;
  lease.holder = `tick-${state.ticksTotal + 1}`;
  lease.acquiredAt = ranAt;
  try {
    state.ticksTotal += 1;
    state.lastRunAt = ranAt;

    const cursorAtStart = state.lastProcessedId;
    let rows: PerceptionSourceRow[];
    try {
      rows = await getEventsAfterId(cursorAtStart, MIND_TICK_BATCH_LIMIT);
    } catch (error) {
      // pg unavailable (no DATABASE_URL locally, network blip…) →
      // counted skip with a structured error — not a silent one.
      state.ticksSkipped += 1;
      state.lastError = truncateError(error);
      logStructured("inbox-read-failed", { error: truncateError(error), ranAt });
      return emptyResult(ranAt);
    }

    // (1) Contract replay: fail-closed per-row admission via B8. The
    // cursor advances ONLY past rows with a processed outcome (valid)
    // or a durably-quarantined outcome. A failed quarantine write halts
    // the cursor at that row; the remainder is deferred to next tick.
    const valid: PerceptionSourceRow[] = [];
    let quarantined = 0;
    let halted = false;
    let deferred = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const structural =
        Number.isFinite(row.id) &&
        typeof row.source === "string" &&
        row.source.length > 0;
      const validation = structural ? replayContract(row) : null;
      if (validation?.valid) {
        valid.push(row);
      } else {
        const correlationId = quarantineCorrelationId(row, cursorAtStart, i);
        const durable = await quarantineRow(row, validation, correlationId);
        if (!durable) {
          halted = true;
          deferred = rows.length - i;
          break;
        }
        quarantined += 1;
      }
      state.processedTotal += 1;
      if (Number.isFinite(row.id)) {
        state.lastProcessedId = Math.max(state.lastProcessedId, row.id);
      }
    }
    state.validTotal += valid.length;
    state.quarantinedTotal += quarantined;

    // (2)–(5) B5 pipeline → signals → B7 proposals. Any engine-level
    // throw is absorbed with a structured error: the cursor already
    // advanced over processed rows, nothing escapes the cycle.
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
      logStructured("pipeline-failed", { error: truncateError(error), ranAt });
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
      quarantined,
      halted,
      deferred,
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
    logStructured("tick-failed", { error: truncateError(error), ranAt });
    return emptyResult(ranAt);
  } finally {
    lease.held = false;
    lease.holder = null;
    lease.acquiredAt = null;
  }
}

/**
 * Cron-level failure hook (boot.ts catch): structured error + metric +
 * readiness evidence — a cron failure is never a bare console line.
 * runMindTick never throws by design, so this firing at all is itself
 * a signal worth counting.
 */
export function recordMindTickCronFailure(error: unknown, clock: Clock = () => new Date()): void {
  state.cronFailures += 1;
  state.lastCronError = truncateError(error);
  logStructured("cron-tick-failed", {
    error: truncateError(error),
    cronFailures: state.cronFailures,
    at: clock().toISOString(),
  });
}

/** Counters only — no event payloads or contents are ever exposed here. */
export function getMindTickStatus(): MindTickStatus {
  return {
    lastProcessedId: state.lastProcessedId,
    processedTotal: state.processedTotal,
    validTotal: state.validTotal,
    quarantinedTotal: state.quarantinedTotal,
    quarantineFailures: state.quarantineFailures,
    contradictionsTotal: state.contradictionsTotal,
    patternsTotal: state.patternsTotal,
    suggestionsTotal: state.suggestionsTotal,
    requiresApprovalTotal: state.requiresApprovalTotal,
    autoEligibleTotal: state.autoEligibleTotal,
    ticksTotal: state.ticksTotal,
    ticksSkipped: state.ticksSkipped,
    leaseRejected: state.leaseRejected,
    cronFailures: state.cronFailures,
    lastCronError: state.lastCronError,
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

/** DLQ audit surface: every durably-quarantined row with its rejection
 *  reasons and correlation id (identity fields only, never payloads). */
export async function listMindTickQuarantine(): Promise<MemoryRecord[]> {
  try {
    return await getQuarantineStore().list(MIND_TICK_QUARANTINE_KIND);
  } catch (error) {
    state.lastError = truncateError(error);
    logStructured("quarantine-list-failed", { error: truncateError(error) });
    return [];
  }
}

// Test-only: inject a quarantine store (in-memory / failing double)
export function __setMindTickQuarantineStoreForTests(store: MemoryStore | null): void {
  quarantineStore = store;
}

// Test-only: reset cursor/counters/lease/last result
export function __resetMindTickForTests(): void {
  state.lastProcessedId = 0;
  state.processedTotal = 0;
  state.validTotal = 0;
  state.quarantinedTotal = 0;
  state.quarantineFailures = 0;
  state.contradictionsTotal = 0;
  state.patternsTotal = 0;
  state.suggestionsTotal = 0;
  state.requiresApprovalTotal = 0;
  state.autoEligibleTotal = 0;
  state.ticksTotal = 0;
  state.ticksSkipped = 0;
  state.leaseRejected = 0;
  state.cronFailures = 0;
  state.lastCronError = null;
  state.lastRunAt = null;
  state.lastError = null;
  lease.held = false;
  lease.holder = null;
  lease.acquiredAt = null;
  quarantineStore = null;
  lastResult = null;
}
