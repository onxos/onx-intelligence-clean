// ============================================================
// INSIGHT ACK — Wave 9-a "Founder verdict feeds back into the mind"
// Second reverse-channel hop: after the platform pulled insights over
// titan.listInsights (Wave 8-a), the founder approves or rejects them
// in the platform decision inbox and the platform notifies the mind
// through titan.acknowledgeInsight. Each verdict is planted back into
// the live IURG graph so the mind learns from its founder's judgments.
//
// Representation: same non-invasive shape the reflection cycle uses
// for insights (api/lib/reflection-cycle.ts) — a PATTERN object at
// rank R2 ingested through the exact iuc.ingest path — distinguished
// by the deterministic id `ack-<insightId>`. Because the id no longer
// starts with `insight-`, the insights port (Wave 8-a) never serves
// acks back to the platform: verdicts flow inward only.
//
// Determinism & idempotency: `ack-<insightId>` is derived solely from
// the acknowledged insight, so repeating a verdict (or changing it)
// upserts the single existing graph node — never a duplicate. Wave 6-b
// persistence picks the object up automatically via iuc.ingest.
//
// SAFETY (PR #18 rule): recordInsightAck NEVER throws. Ids that are
// not insight ids are politely refused ({ok:false, reason:'NOT_AN_INSIGHT'})
// and any internal failure is absorbed into {ok:false, reason} plus the
// acksFailedTotal counter. Counters are memory-only numbers surfaced
// through HT-10 (health.reflection) — no verdict contents are exposed.
// ============================================================
import { iucRouter } from "../iuc-router";
import type { TrpcContext } from "../context";

const MAX_CONTENT_LENGTH = 300;
const MAX_REASON_LENGTH = 200;
export const INSIGHT_ID_PREFIX = "insight-";
export const ACK_ID_PREFIX = "ack-";

export type AckVerdict = "approved" | "rejected";

/** Arabic labels for the founder's verdict, embedded in the ack contentText. */
export const VERDICT_LABEL_AR: Record<AckVerdict, string> = {
  approved: "اعتماد",
  rejected: "رفض",
};

export interface InsightAckInput {
  insightId: string;
  verdict: AckVerdict;
  decidedAt?: string | undefined;
}

export interface InsightAckResult {
  ok: boolean;
  reason?: string;
}

/** Same ingest shape the reflection cycle plants — PATTERN at R2. */
export interface AckIngestInput {
  id: string;
  type: "PATTERN";
  rank: 2;
  verification: "PROBABLE";
  contentText: string;
  ageDays: number;
  sources: number;
  trust: number;
  amanah: number;
  founderAlignment: number;
  validated: boolean;
}

export interface InsightAckCounters {
  acksReceivedTotal: number;
  acksFailedTotal: number;
}

const state = {
  acksReceivedTotal: 0,
  acksFailedTotal: 0,
};

type IngestFn = (input: AckIngestInput) => Promise<unknown>;

let caller: ReturnType<typeof iucRouter.createCaller> | null = null;

function ingestViaIucRouter(input: AckIngestInput): Promise<unknown> {
  if (!caller) {
    // Same internal-context pattern as reflection-cycle: ingest never reads ctx.
    caller = iucRouter.createCaller({
      req: new Request("http://intelligence.internal/insight-ack"),
      resHeaders: new Headers(),
    } as TrpcContext);
  }
  return caller.ingest(input);
}

let ingestFn: IngestFn = ingestViaIucRouter;

function truncateReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_REASON_LENGTH);
}

function clampText(text: string): string {
  return text.slice(0, MAX_CONTENT_LENGTH);
}

/** Deterministic ack object for one founder verdict on one insight. */
function buildAckObject(input: InsightAckInput): AckIngestInput {
  const label = VERDICT_LABEL_AR[input.verdict];
  const decided = input.decidedAt ? ` (قُرر في ${input.decidedAt})` : "";
  return {
    id: `${ACK_ID_PREFIX}${input.insightId}`,
    type: "PATTERN",
    rank: 2,
    verification: "PROBABLE",
    contentText: clampText(`حكم المؤسس على الرؤية ${input.insightId}: ${label}${decided}`),
    ageDays: 0,
    sources: 1,
    trust: 0.75,
    amanah: 0.9,
    founderAlignment: 0.7,
    validated: true,
  };
}

/**
 * Record one founder verdict on one insight into the live IURG graph as
 * an upserted `ack-<insightId>` PATTERN/R2 object. NEVER throws: non-insight
 * ids are refused with {ok:false, reason:'NOT_AN_INSIGHT'} and internal
 * failures come back as {ok:false, reason} with the failure counter bumped.
 */
export async function recordInsightAck(input: InsightAckInput): Promise<InsightAckResult> {
  try {
    if (!input.insightId.startsWith(INSIGHT_ID_PREFIX)) {
      state.acksFailedTotal += 1;
      return { ok: false, reason: "NOT_AN_INSIGHT" };
    }
    await ingestFn(buildAckObject(input));
    state.acksReceivedTotal += 1;
    return { ok: true };
  } catch (error) {
    // Never-throw contract: absorb, count, report politely.
    state.acksFailedTotal += 1;
    return { ok: false, reason: truncateReason(error) };
  }
}

/** Numbers only for HT-10 (health.reflection) — no verdict contents exposed. */
export function getInsightAckCounters(): InsightAckCounters {
  return {
    acksReceivedTotal: state.acksReceivedTotal,
    acksFailedTotal: state.acksFailedTotal,
  };
}

// Test-only seams (same pattern as reflection-cycle)
export function __resetInsightAckForTests(): void {
  state.acksReceivedTotal = 0;
  state.acksFailedTotal = 0;
  caller = null;
  ingestFn = ingestViaIucRouter;
}

export function __setAckIngestFnForTests(fn: IngestFn | null): void {
  ingestFn = fn ?? ingestViaIucRouter;
}
