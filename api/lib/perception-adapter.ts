// ============================================================
// PERCEPTION ADAPTER — Wave 5-b "Mind thinks about body"
// Bridges the platform event inbox (Postgres, api/lib/platform-
// inbox-store.ts) into the in-memory IUC graph by converting each
// inbox event into a PERCEPTION object and injecting it through
// the exact same iuc.ingest path the tRPC endpoint uses.
//
// Design contract (E-1 recommendation):
//   - object id  = perc-<source>-<eventId>   → idempotent (Map upsert)
//   - type       = PERCEPTION, rank R1
//   - contentText = event type + aggregate + payload *keys* only
//     (payload values never leave Postgres — keys are extracted
//     SQL-side by getEventsAfterId)
//   - cursor is module-level and in-memory: the IUC graph resets on
//     every process restart, so the adapter deliberately restarts
//     from id=0 and replays the full inbox to rebuild the graph.
//   - batch cap per tick prevents unbounded work.
//
// SAFETY: this module must be un-killable. Every path is wrapped;
// a pg failure (e.g. missing DATABASE_URL locally) is a silent
// skip that only bumps counters. runPerceptionSyncTick never throws.
// ============================================================
import { iucRouter } from "../iuc-router";
import type { TrpcContext } from "../context";
import { getEventsAfterId, type PerceptionSourceRow } from "./platform-inbox-store";

export const PERCEPTION_BATCH_LIMIT = 200;
const MAX_SUMMARY_LENGTH = 300;
const MAX_ERROR_LENGTH = 200;
const MAX_AGE_DAYS = 3650;
const MAX_PAYLOAD_KEYS = 12;

export interface PerceptionIngestInput {
  id: string;
  type: "PERCEPTION";
  rank: 1;
  verification: "CONFIRMED";
  contentText: string;
  ageDays: number;
  sources: number;
  trust: number;
  amanah: number;
  founderAlignment: number;
}

export interface PerceptionAdapterStatus {
  lastProcessedId: number;
  processedTotal: number;
  perceptionsIngested: number;
  eventsFailed: number;
  ticksTotal: number;
  ticksSkipped: number;
  lastRunAt: string | null;
  lastError: string | null;
  batchLimit: number;
}

const state = {
  lastProcessedId: 0,
  processedTotal: 0,
  perceptionsIngested: 0,
  eventsFailed: 0,
  ticksTotal: 0,
  ticksSkipped: 0,
  lastRunAt: null as string | null,
  lastError: null as string | null,
  running: false,
};

type IngestFn = (input: PerceptionIngestInput) => Promise<unknown>;

let caller: ReturnType<typeof iucRouter.createCaller> | null = null;

function ingestViaIucRouter(input: PerceptionIngestInput): Promise<unknown> {
  if (!caller) {
    // The ingest mutation never reads ctx; a minimal internal context is enough.
    caller = iucRouter.createCaller({
      req: new Request("http://intelligence.internal/perception-adapter"),
      resHeaders: new Headers(),
    } as TrpcContext);
  }
  return caller.ingest(input);
}

let ingestFn: IngestFn = ingestViaIucRouter;

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function ageDaysFrom(row: PerceptionSourceRow): number {
  const iso = row.occurredAt ?? row.receivedAt;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  const days = (Date.now() - t) / 86_400_000;
  if (!Number.isFinite(days)) return 0;
  return Math.min(MAX_AGE_DAYS, Math.max(0, Math.round(days * 100) / 100));
}

/** Terse, leak-free summary: event type + aggregate + payload key names only. */
function summarize(row: PerceptionSourceRow): string {
  const entity = row.aggregateType
    ? `${row.aggregateType}#${row.aggregateId ?? "?"}`
    : "unknown-entity";
  const keys = (row.payloadKeys ?? []).slice(0, MAX_PAYLOAD_KEYS);
  const fields = keys.length > 0 ? ` fields[${keys.join(",")}]` : "";
  return `platform-event ${row.eventType} on ${entity}${fields}`.slice(0, MAX_SUMMARY_LENGTH);
}

/** Pure transform: inbox row → PERCEPTION object for iuc.ingest. */
export function toPerceptionObject(row: PerceptionSourceRow): PerceptionIngestInput {
  return {
    // source+event_id derived id → replays and retries upsert the same node
    id: `perc-${sanitizeIdPart(row.source)}-${row.eventId}`,
    type: "PERCEPTION",
    rank: 1,
    // Persisted fact received over the authenticated bridge
    verification: "CONFIRMED",
    contentText: summarize(row),
    ageDays: ageDaysFrom(row),
    sources: 1,
    trust: 0.8,
    amanah: 0.9,
    founderAlignment: 0.7,
  };
}

/**
 * One sync tick: read a bounded batch of inbox events past the in-memory
 * cursor and inject each as a PERCEPTION into the IUC graph.
 * NEVER throws — every failure is absorbed into the counters.
 */
export async function runPerceptionSyncTick(): Promise<PerceptionAdapterStatus> {
  if (state.running) return getPerceptionAdapterStatus();
  state.running = true;
  try {
    state.ticksTotal += 1;
    state.lastRunAt = new Date().toISOString();

    let rows: PerceptionSourceRow[];
    try {
      rows = await getEventsAfterId(state.lastProcessedId, PERCEPTION_BATCH_LIMIT);
    } catch (error) {
      // pg unavailable (no DATABASE_URL locally, network blip…) → silent skip
      state.ticksSkipped += 1;
      state.lastError = truncateError(error);
      return getPerceptionAdapterStatus();
    }

    for (const row of rows) {
      try {
        await ingestFn(toPerceptionObject(row));
        state.perceptionsIngested += 1;
      } catch (error) {
        // Poison event: count it and advance past it (a full retry happens
        // anyway on next boot replay) — it must never wedge the feed.
        state.eventsFailed += 1;
        state.lastError = truncateError(error);
      } finally {
        state.processedTotal += 1;
        if (Number.isFinite(row.id)) {
          state.lastProcessedId = Math.max(state.lastProcessedId, row.id);
        }
      }
    }
    return getPerceptionAdapterStatus();
  } catch (error) {
    // Belt and braces: nothing above should throw, but nothing may escape.
    state.lastError = truncateError(error);
    return getPerceptionAdapterStatus();
  } finally {
    state.running = false;
  }
}

/** Counters only — no event payloads or contents are ever exposed here. */
export function getPerceptionAdapterStatus(): PerceptionAdapterStatus {
  return {
    lastProcessedId: state.lastProcessedId,
    processedTotal: state.processedTotal,
    perceptionsIngested: state.perceptionsIngested,
    eventsFailed: state.eventsFailed,
    ticksTotal: state.ticksTotal,
    ticksSkipped: state.ticksSkipped,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    batchLimit: PERCEPTION_BATCH_LIMIT,
  };
}

// Test-only: reset cursor/counters and swap the ingest seam
export function __resetPerceptionAdapterForTests(): void {
  state.lastProcessedId = 0;
  state.processedTotal = 0;
  state.perceptionsIngested = 0;
  state.eventsFailed = 0;
  state.ticksTotal = 0;
  state.ticksSkipped = 0;
  state.lastRunAt = null;
  state.lastError = null;
  state.running = false;
  caller = null;
  ingestFn = ingestViaIucRouter;
}

export function __setIngestFnForTests(fn: IngestFn | null): void {
  ingestFn = fn ?? ingestViaIucRouter;
}
