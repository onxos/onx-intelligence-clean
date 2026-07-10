// ============================================================
// REFLECTION CYCLE — Wave 7-c "Mind reflects on what it perceives"
// Reads the PERCEPTION objects accumulated in the live IUC graph
// (fed by api/lib/perception-adapter.ts) and derives INSIGHT objects
// from them with deterministic, zero-cost inference rules — no LLM.
//
// Insights are represented as IURG PATTERN objects at rank R2: the
// IURG type enum (api/iuc-engine.ts) has no INSIGHT type, and the R2
// rung is literally named "pattern" — extending the enum would shift
// the UC coverage indicator for every existing graph, so PATTERN/R2
// with an `insight-` id prefix is the non-invasive representation.
//
// Rules (all deterministic, all payload-value-free):
//   1. completed-cycle  — an aggregate whose event chain reached its
//      terminal stage (e.g. payroll.run.created→…→paid)
//   2. recurrence       — ≥3 events of one type in the last 24h
//   3. coverage         — one always-updated insight counting the
//      distinct perceived domains (event-type prefixes)
//
// Determinism & idempotency: every insight id is derived from the
// rule + its subject (insight-cycle-<domain>-<aggId>,
// insight-pattern-<eventType>, insight-coverage). Re-running a tick
// re-ingests the same ids through the exact iuc.ingest path the
// perception adapter uses → graph Map upsert + Wave 6-b persistence,
// never duplication.
//
// SAFETY (PR #18 lesson): runReflectionTick NEVER throws. Any failure
// bumps a counter, truncates into lastError and is silently skipped.
// ============================================================
import { iucRouter, listLiveObjects } from "../iuc-router";
import type { TrpcContext } from "../context";

const MAX_CONTENT_LENGTH = 300;
const MAX_ERROR_LENGTH = 200;
const MAX_DOMAINS_LISTED = 12;
export const RECURRENCE_MIN_COUNT = 3;
export const RECURRENCE_WINDOW_DAYS = 1; // ageDays ≤ 1 ⇒ within last 24h

/** Terminal event chains the mind can recognize as completed cycles. */
export const CYCLE_DEFINITIONS = [
  {
    domain: "payroll",
    stages: [
      "payroll.run.created",
      "payroll.run.submitted",
      "payroll.run.approved",
      "payroll.run.paid",
    ],
    labelAr: "دورة رواتب مكتملة بنجاح",
  },
] as const;

export interface InsightIngestInput {
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

/** Minimal shape of a live graph node the cycle needs. */
export interface LiveGraphNode {
  id?: string;
  type: string;
  contentText?: string;
  ageDays?: number;
}

interface ParsedPerception {
  eventType: string;
  aggregateType: string | null;
  aggregateId: string | null;
  ageDays: number;
}

export interface ReflectionStatus {
  insightsGenerated: number;
  insightsFailed: number;
  rulesEvaluated: number;
  perceptionsScanned: number;
  ticksTotal: number;
  ticksSkipped: number;
  lastRunAt: string | null;
  lastError: string | null;
}

const state = {
  insightsGenerated: 0,
  insightsFailed: 0,
  rulesEvaluated: 0,
  perceptionsScanned: 0,
  ticksTotal: 0,
  ticksSkipped: 0,
  lastRunAt: null as string | null,
  lastError: null as string | null,
  running: false,
};

type IngestFn = (input: InsightIngestInput) => Promise<unknown>;
type ListFn = () => LiveGraphNode[];

let caller: ReturnType<typeof iucRouter.createCaller> | null = null;

function ingestViaIucRouter(input: InsightIngestInput): Promise<unknown> {
  if (!caller) {
    // Same internal-context pattern as perception-adapter: ingest never reads ctx.
    caller = iucRouter.createCaller({
      req: new Request("http://intelligence.internal/reflection-cycle"),
      resHeaders: new Headers(),
    } as TrpcContext);
  }
  return caller.ingest(input);
}

let ingestFn: IngestFn = ingestViaIucRouter;
let listFn: ListFn = listLiveObjects;

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/** Id-safe slug; dots kept so event types stay readable in insight ids. */
function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function clampText(text: string): string {
  return text.slice(0, MAX_CONTENT_LENGTH);
}

// Perception contentText is produced by perception-adapter.summarize():
//   "platform-event <eventType> on <aggType>#<aggId>[ fields[...]]"
// Parsing it back keeps the reflection layer decoupled from Postgres and
// guarantees it only ever sees what the perception layer already exposed
// (event type + aggregate reference + payload KEY names — never values).
const PERCEPTION_RE = /^platform-event (\S+) on (\S+)/;

function parsePerception(node: LiveGraphNode): ParsedPerception | null {
  if (node.type !== "PERCEPTION" || !node.contentText) return null;
  const match = PERCEPTION_RE.exec(node.contentText);
  if (!match) return null;
  const [, eventType, entity] = match;
  let aggregateType: string | null = null;
  let aggregateId: string | null = null;
  const hashIdx = entity.indexOf("#");
  if (hashIdx > 0) {
    aggregateType = entity.slice(0, hashIdx);
    aggregateId = entity.slice(hashIdx + 1) || null;
  }
  const age = node.ageDays;
  return {
    eventType,
    aggregateType,
    aggregateId,
    ageDays: typeof age === "number" && Number.isFinite(age) ? age : 0,
  };
}

function baseInsight(id: string, contentText: string, sources: number): InsightIngestInput {
  return {
    id,
    type: "PATTERN",
    rank: 2,
    verification: "PROBABLE",
    contentText: clampText(contentText),
    ageDays: 0,
    sources: Math.max(1, Math.trunc(sources)),
    trust: 0.75,
    amanah: 0.9,
    founderAlignment: 0.7,
    validated: true,
  };
}

/** Rule 1 — completed cycles: all stages of a known chain seen for one aggregate. */
function completedCycleInsights(perceptions: ParsedPerception[]): InsightIngestInput[] {
  const insights: InsightIngestInput[] = [];
  for (const def of CYCLE_DEFINITIONS) {
    const stageSet = new Set<string>(def.stages);
    const byAggregate = new Map<string, Set<string>>();
    for (const p of perceptions) {
      if (!p.aggregateId || !stageSet.has(p.eventType)) continue;
      let seen = byAggregate.get(p.aggregateId);
      if (!seen) {
        seen = new Set<string>();
        byAggregate.set(p.aggregateId, seen);
      }
      seen.add(p.eventType);
    }
    const sortedAggregates = [...byAggregate.keys()].sort();
    for (const aggregateId of sortedAggregates) {
      const seen = byAggregate.get(aggregateId)!;
      if (seen.size !== stageSet.size) continue;
      const terminal = def.stages[def.stages.length - 1];
      insights.push(
        baseInsight(
          `insight-cycle-${def.domain}-${sanitizeIdPart(aggregateId)}`,
          `${def.labelAr}: السجل ${sanitizeIdPart(aggregateId)} اجتاز ${def.stages.length} مراحل حتى ${terminal}`,
          def.stages.length,
        ),
      );
    }
  }
  return insights;
}

/** Rule 2 — recurrence: ≥3 events of one type within the last 24h. */
function recurrenceInsights(perceptions: ParsedPerception[]): InsightIngestInput[] {
  const counts = new Map<string, number>();
  for (const p of perceptions) {
    if (p.ageDays > RECURRENCE_WINDOW_DAYS) continue;
    counts.set(p.eventType, (counts.get(p.eventType) ?? 0) + 1);
  }
  const insights: InsightIngestInput[] = [];
  for (const eventType of [...counts.keys()].sort()) {
    const count = counts.get(eventType)!;
    if (count < RECURRENCE_MIN_COUNT) continue;
    insights.push(
      baseInsight(
        `insight-pattern-${sanitizeIdPart(eventType)}`,
        `نمط متكرر: ${eventType} ×${count} خلال آخر 24 ساعة`,
        count,
      ),
    );
  }
  return insights;
}

/** Rule 3 — coverage: one always-updated insight over the distinct domains. */
function coverageInsight(perceptions: ParsedPerception[]): InsightIngestInput | null {
  const domains = new Set<string>();
  for (const p of perceptions) {
    const dot = p.eventType.indexOf(".");
    domains.add(dot > 0 ? p.eventType.slice(0, dot) : p.eventType);
  }
  if (domains.size === 0) return null;
  const listed = [...domains].sort().slice(0, MAX_DOMAINS_LISTED);
  return baseInsight(
    "insight-coverage",
    `اتساع إدراك العقل: ${domains.size} مجالات (${listed.join("، ")})`,
    domains.size,
  );
}

/**
 * Pure rule engine: PERCEPTIONs → deterministic INSIGHT objects.
 * Output ordering is stable (cycles, recurrences, coverage; sorted subjects)
 * and contentText never contains payload values — only event-type names,
 * aggregate references and counts already exposed by the perception layer.
 */
export function computeInsights(nodes: LiveGraphNode[]): InsightIngestInput[] {
  const perceptions: ParsedPerception[] = [];
  for (const node of nodes) {
    const parsed = parsePerception(node);
    if (parsed) perceptions.push(parsed);
  }
  const insights: InsightIngestInput[] = [
    ...completedCycleInsights(perceptions),
    ...recurrenceInsights(perceptions),
  ];
  const coverage = coverageInsight(perceptions);
  if (coverage) insights.push(coverage);
  return insights;
}

/**
 * One reflection tick: scan live PERCEPTIONs, derive insights, ingest each
 * through iuc.ingest (upsert by deterministic id → idempotent, persisted
 * via the Wave 6-b store). NEVER throws — every failure is absorbed.
 */
export async function runReflectionTick(): Promise<ReflectionStatus> {
  if (state.running) return getReflectionStatus();
  state.running = true;
  try {
    state.ticksTotal += 1;
    state.lastRunAt = new Date().toISOString();

    let insights: InsightIngestInput[];
    try {
      const nodes = listFn();
      state.perceptionsScanned += nodes.filter((n) => n.type === "PERCEPTION").length;
      insights = computeInsights(nodes);
      state.rulesEvaluated += 2 + CYCLE_DEFINITIONS.length;
    } catch (error) {
      // Graph unavailable → silent skip with counters only.
      state.ticksSkipped += 1;
      state.lastError = truncateError(error);
      return getReflectionStatus();
    }

    for (const insight of insights) {
      try {
        await ingestFn(insight);
        state.insightsGenerated += 1;
      } catch (error) {
        // A poison insight must never wedge the cycle — count and move on.
        state.insightsFailed += 1;
        state.lastError = truncateError(error);
      }
    }
    return getReflectionStatus();
  } catch (error) {
    // Belt and braces: nothing above should throw, but nothing may escape.
    state.lastError = truncateError(error);
    return getReflectionStatus();
  } finally {
    state.running = false;
  }
}

/** Counters only for HT-10 (health.reflection) — no insight contents exposed. */
export function getReflectionStatus(): ReflectionStatus {
  return {
    insightsGenerated: state.insightsGenerated,
    insightsFailed: state.insightsFailed,
    rulesEvaluated: state.rulesEvaluated,
    perceptionsScanned: state.perceptionsScanned,
    ticksTotal: state.ticksTotal,
    ticksSkipped: state.ticksSkipped,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
  };
}

// Test-only: reset counters and swap the list/ingest seams
export function __resetReflectionCycleForTests(): void {
  state.insightsGenerated = 0;
  state.insightsFailed = 0;
  state.rulesEvaluated = 0;
  state.perceptionsScanned = 0;
  state.ticksTotal = 0;
  state.ticksSkipped = 0;
  state.lastRunAt = null;
  state.lastError = null;
  state.running = false;
  caller = null;
  ingestFn = ingestViaIucRouter;
  listFn = listLiveObjects;
}

export function __setIngestFnForTests(fn: IngestFn | null): void {
  ingestFn = fn ?? ingestViaIucRouter;
}

export function __setListFnForTests(fn: ListFn | null): void {
  listFn = fn ?? listLiveObjects;
}
