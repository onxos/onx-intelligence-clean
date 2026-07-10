// ============================================================
// INSIGHTS PORT — Wave 8-a "Mind speaks back"
// First reverse channel (mind → body): the platform pulls the
// insights the reflection cycle derived (api/lib/reflection-cycle.ts
// ingests PATTERN R2 objects with `insight-` ids into the live IURG
// graph) so the founder can see them in the platform decision inbox.
//
// Read-only by design: reads listLiveObjects() only — never writes
// the graph, never touches the store, never calls an LLM.
//
// Exposure contract: each served insight carries ONLY
//   { id, contentText, rank, verification, type, createdAt }
// Internal graph scores (trust / amanah / founderAlignment / …)
// never leave the mind.
//
// createdAt is derived from the node's ageDays — the only temporal
// field an IurgNode carries (zero schema changes): now − ageDays.
// Fresh insights (ageDays 0) therefore always sort newest and pass
// any past afterTimestamp filter — exactly what a pull feed wants.
//
// SAFETY (PR #18 rule): listInsightsFromGraph NEVER throws. A graph
// read failure or an empty graph yields { insights: [], count: 0 }.
// ============================================================
import { listLiveObjects } from "../iuc-router";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
const INSIGHT_ID_PREFIX = "insight-";
const DAY_MS = 86_400_000;

/** The ONLY fields the bridge may ever see for an insight. */
export interface ServedInsight {
  id: string;
  contentText: string;
  rank: number;
  verification: string;
  type: string;
  createdAt: string;
}

export interface InsightsPortResult {
  insights: ServedInsight[];
  count: number;
}

/** Minimal live-graph node shape the port reads (seam mirrors reflection-cycle). */
export interface PortGraphNode {
  id?: string;
  type: string;
  rank?: number;
  verification?: string;
  contentText?: string;
  ageDays?: number;
}

type ListFn = () => PortGraphNode[];
let listFn: ListFn = listLiveObjects;

// Wave 8-a observability: insights handed to the body since boot.
// Number only — surfaced through HT-10 (health.reflection).
let insightsServedTotal = 0;

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);
}

function toServed(node: PortGraphNode, now: number): ServedInsight | null {
  if (!node.id || !node.id.startsWith(INSIGHT_ID_PREFIX)) return null;
  const age =
    typeof node.ageDays === "number" && Number.isFinite(node.ageDays) && node.ageDays > 0
      ? node.ageDays
      : 0;
  return {
    id: node.id,
    contentText: node.contentText ?? "",
    rank: node.rank ?? 2,
    verification: node.verification ?? "UNVERIFIED",
    type: node.type,
    createdAt: new Date(now - age * DAY_MS).toISOString(),
  };
}

/**
 * Read the live graph and serve only `insight-*` objects, chronologically
 * ascending (oldest → newest, deterministic id tiebreak), optionally
 * filtered to createdAt strictly after `afterTimestamp`, trimmed to
 * `limit` (default 50, hard cap 200). NEVER throws.
 */
export function listInsightsFromGraph(
  options: { afterTimestamp?: string | undefined; limit?: number | undefined } = {},
): InsightsPortResult {
  try {
    const nodes = listFn();
    const now = Date.now();

    let after: number | null = null;
    if (options.afterTimestamp) {
      const parsed = Date.parse(options.afterTimestamp);
      if (Number.isFinite(parsed)) after = parsed;
    }

    const served: ServedInsight[] = [];
    for (const node of nodes) {
      const insight = toServed(node, now);
      if (!insight) continue;
      if (after !== null && Date.parse(insight.createdAt) <= after) continue;
      served.push(insight);
    }

    // ISO-8601 strings compare lexicographically = chronologically.
    served.sort((a, b) =>
      a.createdAt < b.createdAt ? -1
      : a.createdAt > b.createdAt ? 1
      : a.id < b.id ? -1
      : a.id > b.id ? 1
      : 0,
    );

    const insights = served.slice(0, clampLimit(options.limit));
    insightsServedTotal += insights.length;
    return { insights, count: insights.length };
  } catch {
    // Never-throw contract: a broken graph read = an empty feed.
    return { insights: [], count: 0 };
  }
}

/** Number for HT-10 — insights delivered over the bridge since boot. */
export function getInsightsServedTotal(): number {
  return insightsServedTotal;
}

// Test-only seams (same pattern as reflection-cycle)
export function __resetInsightsPortForTests(): void {
  insightsServedTotal = 0;
  listFn = listLiveObjects;
}

export function __setInsightsListFnForTests(fn: ListFn | null): void {
  listFn = fn ?? listLiveObjects;
}
