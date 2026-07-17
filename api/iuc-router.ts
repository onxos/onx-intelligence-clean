// ============================================================
// IUC ROUTER — Intelligence Understanding Capital dashboard API (I-M4)
// Exposes the IUC engine (api/iuc-engine.ts) over tRPC:
//   - live 11-indicator snapshot over an in-memory IURG store
//   - object ingestion (PERCEPTION…OUTCOME) with VG + ladder checks
//   - the 16 IURG types, R1→R6 ladder rules, indicator thresholds
// In-memory + deterministic → runs in CI with no DB / external deps.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  computeIUC,
  objectIUC,
  validationGates,
  checkPromotion,
  TYPE_WEIGHTS,
  MATURITY_BY_RANK,
  IURG_TYPES,
  CORE_TYPES,
  CONSTRAINT_TYPES,
  SUPPORTING_TYPES,
  type IurgObjectInput,
  type IurgObjectType,
  type Rank,
  type VerificationLevel,
} from "./iuc-engine";
import { IurgContinuityGraph } from "./iuc-continuity";
import {
  appendContinuityLog,
  clearIucSnapshots,
  clearContinuityLogEntries,
  getIucHealthStats,
  getIurgObjectCounts,
  getIurgObjects,
  getLatestIucSnapshot,
  recordObjectsLoadedOnBoot,
  replaceIurgObjects,
  replaceIurgObjectsByIdPrefix,
  saveIucSnapshot,
  saveIurgObject,
} from "./lib/iurg-store";
import { getIucRuntimeStatus } from "./lib/iuc-runtime";
import { searchCorpus, summarizeCorpus } from "./lib/corpus";
import { buildCorpusGraph, relatedByQuery } from "./lib/corpus-graph";
import { vectorSearchCorpus } from "./lib/corpus-vector";
import { planRetention, applyRetention } from "./lib/corpus-retention";
import { filterByClearance, accessBreakdown } from "./lib/corpus-access";
import { buildInvertedIndex, indexStats, bm25Search } from "./lib/corpus-index";

const zType = z.enum(IURG_TYPES as unknown as [IurgObjectType, ...IurgObjectType[]]);
const zVerification = z.enum(["UNVERIFIED", "POSSIBLE", "PROBABLE", "CONFIRMED", "PROVEN"]);

const zRetentionPolicy = z.object({
  dropSynthetic: z.boolean().default(true),
  minQuality: z.number().min(0).max(1).default(0),
});

const zClearance = z.enum(["PUBLIC", "INTERNAL", "RESTRICTED"]).default("PUBLIC");

const zObject = z.object({
  id: z.string().optional(),
  type: zType,
  rank: z.number().int().min(1).max(6).optional(),
  verification: zVerification.optional(),
  contentText: z.string().max(500).optional(),
  ageDays: z.number().min(0).optional(),
  context: z.number().min(0).max(1).optional(),
  yield: z.number().min(0).max(1).optional(),
  amanah: z.number().min(0).max(1).optional(),
  founderAlignment: z.number().min(0).max(1).optional(),
  validated: z.boolean().optional(),
  sources: z.number().int().min(0).optional(),
  trust: z.number().min(0).max(1).optional(),
  transfer: z.number().min(0).max(1).optional(),
  overrides: z.number().int().min(0).optional(),
  drift: z.number().min(0).max(1).optional(),
  catastrophe: z.boolean().optional(),
});

function toInput(p: z.infer<typeof zObject>): IurgObjectInput {
  return {
    ...p,
    type: p.type as IurgObjectType,
    rank: p.rank as Rank | undefined,
    verification: p.verification as VerificationLevel | undefined,
  };
}

function categoryOf(t: IurgObjectType): "CORE" | "CONSTRAINT" | "SUPPORTING" {
  if ((CORE_TYPES as readonly string[]).includes(t)) return "CORE";
  if ((CONSTRAINT_TYPES as readonly string[]).includes(t)) return "CONSTRAINT";
  return "SUPPORTING";
}

const seedObjects: IurgObjectInput[] = [
  { id: "seed-fi", type: "FOUNDER_INTENT", rank: 6, verification: "PROVEN", amanah: 1.0, founderAlignment: 1.0, validated: true, sources: 3, trust: 0.98, transfer: 0.9 },
  { id: "seed-cc", type: "CONSTITUTIONAL_CONSTRAINT", rank: 6, verification: "PROVEN", amanah: 1.0, founderAlignment: 1.0, validated: true, sources: 3, trust: 0.97, transfer: 0.85 },
  { id: "seed-perc", type: "PERCEPTION", rank: 1, verification: "POSSIBLE", amanah: 0.7, founderAlignment: 0.7, sources: 2, trust: 0.62, transfer: 0.55, ageDays: 1 },
  { id: "seed-patt", type: "PATTERN", rank: 2, verification: "PROBABLE", amanah: 0.8, founderAlignment: 0.75, validated: true, sources: 3, trust: 0.78, transfer: 0.7 },
  { id: "seed-und", type: "UNDERSTANDING", rank: 3, verification: "CONFIRMED", amanah: 0.9, founderAlignment: 0.85, validated: true, sources: 3, trust: 0.87, transfer: 0.75 },
  { id: "seed-judg", type: "JUDGMENT", rank: 4, verification: "CONFIRMED", amanah: 0.95, founderAlignment: 0.9, validated: true, sources: 4, trust: 0.88, transfer: 0.8, yield: 0.9 },
  { id: "seed-dec", type: "DECISION", rank: 3, verification: "PROBABLE", amanah: 0.9, founderAlignment: 0.88, validated: true, sources: 2, trust: 0.8, transfer: 0.72, yield: 0.8 },
  { id: "seed-out", type: "OUTCOME", rank: 4, verification: "PROVEN", amanah: 0.96, founderAlignment: 0.92, validated: true, sources: 3, trust: 0.9, transfer: 0.82, yield: 0.95 },
  { id: "seed-evi", type: "EVIDENCE", rank: 2, verification: "CONFIRMED", amanah: 0.9, founderAlignment: 0.8, validated: true, sources: 3, trust: 0.85, transfer: 0.6 },
  { id: "seed-val", type: "VALIDATION", rank: 3, verification: "PROVEN", amanah: 0.92, founderAlignment: 0.85, validated: true, sources: 3, trust: 0.86, transfer: 0.65 },
];

// --- In-memory IURG continuity graph, seeded with a realistic mini-graph ---
function seedGraph(): IurgContinuityGraph {
  const g = new IurgContinuityGraph();
  for (const s of seedObjects) g.addObject(s);
  return g;
}

let graph = seedGraph();
const tucHistory: number[] = [];

/** Live IURG objects — shared with the D17 measurement engine. */
export function listLiveObjects() {
  return graph.list();
}

// --- Wave 6-b: boot hydration -------------------------------------
// Loads persisted IURG objects (Postgres in production) back into the
// in-memory continuity graph after a restart. Runs BEFORE the perception
// adapter's inbox replay: the replay re-ingests perc-* objects through
// iuc.ingest and upserts over hydrated nodes by id, so order is safe and
// idempotent. Objects go through graph.addObject — the hash chain is
// rebuilt in-memory from GENESIS with fresh OBJECT_CREATED entries, so
// iuc.verifyChain stays chainValid=true. Hydration never re-persists
// (no saveIurgObject / appendContinuityLog) to avoid write amplification.
// NEVER throws — a storage failure only means an empty (seed-only) graph.
export async function hydratePersistedIurgGraph(): Promise<{ loaded: number }> {
  try {
    const persisted = await getIurgObjects();
    let loaded = 0;
    for (const obj of persisted) {
      if (!obj.id) continue;
      graph.addObject(obj, "boot-hydration");
      loaded += 1;
    }
    recordObjectsLoadedOnBoot(loaded);
    return { loaded };
  } catch (error) {
    console.error("[iuc] boot hydration failed (non-fatal):", (error as Error).message);
    return { loaded: 0 };
  }
}

function indicatorValue(
  snapshot: ReturnType<typeof computeIUC>,
  key: "UGR" | "URS" | "UC" | "UY" | "UVR" | "UT" | "CAS" | "FAS",
) {
  return snapshot.indicators.find((i) => i.key === key)?.value ?? 0;
}

export const iucRouter = createRouter({
  // --- The 16 IURG object types (§2.1) ---
  objectTypes: publicQuery.query(() => ({
    total: IURG_TYPES.length,
    types: IURG_TYPES.map((t) => ({
      id: t,
      category: categoryOf(t),
      weight: TYPE_WEIGHTS[t],
    })),
    causalChain: CORE_TYPES,
    constraintLayer: CONSTRAINT_TYPES,
    supporting: SUPPORTING_TYPES,
  })),

  // --- Understanding ladder R1→R6 (§2.2) ---
  ladder: publicQuery.query(() => ({
    ranks: [
      { from: "R1", to: "R2", name: "pattern", threshold: "3 reps + 2 sources + trust ≥ 0.60", gate: "AUTO", human: false },
      { from: "R2", to: "R3", name: "understanding", threshold: "causality + context + FIC + trust ≥ 0.75", gate: "AUTO", human: false },
      { from: "R3", to: "R4", name: "judgment", threshold: "2 branches + 2 cycles + trust ≥ 0.85", gate: "DG-09", human: true },
      { from: "R4", to: "R5", name: "institutional rule", threshold: "1yr + 3 contexts + trust ≥ 0.92 + 0 overrides", gate: "DG-10", human: true },
      { from: "R5", to: "R6", name: "constitutional principle", threshold: "3yr + identity-core + trust ≥ 0.95 + 0 overrides", gate: "FOUNDER_CONSENSUS", human: true },
    ],
    maturityByRank: MATURITY_BY_RANK,
  })),

  // --- Live IUC snapshot: TUC + 11 indicators over the live graph (§2.4) ---
  snapshot: publicQuery
    .input(z.object({ previousTUC: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const previousTUC = input?.previousTUC ?? (tucHistory.length ? tucHistory[tucHistory.length - 1] : undefined);
      return computeIUC(graph.list(), { previousTUC });
    }),

  // --- Commit a snapshot to history (daily iuc.snapshot event) ---
  commit: publicQuery.mutation(async () => {
    const previousTUC = tucHistory.length ? tucHistory[tucHistory.length - 1] : undefined;
    const snap = computeIUC(graph.list(), { previousTUC });
    tucHistory.push(snap.tuc);
    await saveIucSnapshot({
      tuc: snap.tuc,
      ugr: indicatorValue(snap, "UGR"),
      urs: indicatorValue(snap, "URS"),
      ksr: indicatorValue(snap, "UC"),
      pdr: indicatorValue(snap, "UY"),
      krr: indicatorValue(snap, "UVR"),
      kor: indicatorValue(snap, "UT"),
      scg: indicatorValue(snap, "CAS"),
      sai: indicatorValue(snap, "FAS"),
      objectCount: snap.objectCount,
    });
    return { snapshot: snap, historyLength: tucHistory.length };
  }),

  // --- Ingest an IURG object into the graph: contribution + VG + eligibility ---
  ingest: publicQuery.input(zObject).mutation(async ({ input }) => {
    const obj = toInput(input);
    const node = graph.addObject(obj);
    await saveIurgObject(node);
    await appendContinuityLog({
      tick: 0,
      eventType: "SNAPSHOT",
      objectId: node.id,
      detail: `IURG_INGEST:${node.type}:R${node.rank}`,
    });
    return {
      stored: true,
      objectId: node.id,
      objectCount: graph.list().length,
      contribution: Math.round(objectIUC(obj) * 10000) / 10000,
      validation: validationGates(obj),
      promotion: checkPromotion(obj),
      snapshot: computeIUC(graph.list()),
    };
  }),

  // --- DB-backed IUC dashboard snapshot (persistent across restarts) ---
  dashboard: publicQuery.query(async () => {
    const persistedObjects = await getIurgObjects();
    const latest = await getLatestIucSnapshot();
    const computed = computeIUC(persistedObjects, {
      previousTUC: latest ? latest.tuc : undefined,
    });
    return {
      ...computed,
      source: "db",
      latestSnapshot: latest,
    };
  }),

  // --- Persisted corpus status: grouped core counts + provenance/quality ---
  corpusStatus: publicQuery.query(async () => {
    const [counts, persistedObjects, latest] = await Promise.all([
      getIurgObjectCounts(),
      getIurgObjects(),
      getLatestIucSnapshot(),
    ]);

    const computed = computeIUC(persistedObjects);
    const corpus = summarizeCorpus(persistedObjects);

    return {
      perceptionCount: counts.PERCEPTION ?? 0,
      patternCount: counts.PATTERN ?? 0,
      understandingCount: counts.UNDERSTANDING ?? 0,
      totalObjects: persistedObjects.length,
      // --- provenance & quality (honest, measured — no inflation) ---
      provenanceValidCount: corpus.provenanceValidCount,
      authoredCount: corpus.authoredCount,
      ingestedCount: corpus.ingestedCount,
      syntheticCount: corpus.syntheticCount,
      avgQuality: corpus.avgQuality,
      avgProvenanceValidQuality: corpus.avgProvenanceValidQuality,
      tuc: computed.tuc,
      ksr: indicatorValue(computed, "UC"),
      krr: indicatorValue(computed, "UVR"),
      latestSnapshotAt: latest?.timestamp ?? null,
    };
  }),

  // --- Cited corpus retrieval: lexical search over persisted objects that
  //     returns each hit WITH its provenance citation + quality score. ---
  corpusSearch: publicQuery
    .input(z.object({
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(50).default(10),
      provenanceValidOnly: z.boolean().default(false),
      clearance: zClearance,
    }))
    .query(async ({ input }) => {
      const persistedObjects = await getIurgObjects();
      const cleared = filterByClearance(persistedObjects, input.clearance);
      const pool = input.provenanceValidOnly
        ? cleared.filter((o) => o.provenance && o.provenance.type !== "SYNTHETIC" && !!o.provenance.citation)
        : cleared;
      const hits = searchCorpus(pool, input.query, input.limit);
      return {
        query: input.query,
        clearance: input.clearance,
        corpusSize: persistedObjects.length,
        accessible: cleared.length,
        withheld: persistedObjects.length - cleared.length,
        searched: pool.length,
        returned: hits.length,
        results: hits,
      };
    }),

  // --- Corpus knowledge graph: deterministic graph (records / authorities /
  //     domains) built from real provenance metadata. Returns stats only by
  //     default; include nodes/edges when explicitly requested. ---
  corpusGraph: publicQuery
    .input(z.object({ includeElements: z.boolean().default(false), clearance: zClearance }).optional())
    .query(async ({ input }) => {
      const persistedObjects = await getIurgObjects();
      const cleared = filterByClearance(persistedObjects, input?.clearance ?? "PUBLIC");
      const graph = buildCorpusGraph(cleared);
      return {
        stats: graph.stats,
        ...(input?.includeElements ? { nodes: graph.nodes, edges: graph.edges } : {}),
      };
    }),

  // --- Graph-augmented cited retrieval: lexically pick a seed record for the
  //     query, then return its cited graph neighbours (shared authority / terms
  //     / domain). Traversal stays verifiable — every neighbour carries a
  //     citation. ---
  corpusRelated: publicQuery
    .input(z.object({
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(25).default(5),
      clearance: zClearance,
    }))
    .query(async ({ input }) => {
      const persistedObjects = await getIurgObjects();
      const cleared = filterByClearance(persistedObjects, input.clearance);
      return relatedByQuery(cleared, input.query, input.limit);
    }),

  // --- Access-control visibility: measured rollup of how many corpus records a
  //     given clearance tier can read vs. what is withheld (honest, no
  //     inflation). Proves tier enforcement is real, not cosmetic. ---
  corpusAccess: publicQuery
    .input(z.object({ clearance: zClearance }).optional())
    .query(async ({ input }) => {
      const persistedObjects = await getIurgObjects();
      const corpusObjects = persistedObjects.filter((o) => (o.id ?? "").startsWith("corpus-"));
      return accessBreakdown(corpusObjects, input?.clearance ?? "PUBLIC");
    }),

  // --- Inverted-index BM25 retrieval: builds a term->postings index and ranks
  //     with Okapi BM25, scoring ONLY documents that contain a query term
  //     (candidate count reported). Clearance-enforced + CITED. ---
  corpusIndexSearch: publicQuery
    .input(z.object({
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(50).default(10),
      provenanceValidOnly: z.boolean().default(false),
      clearance: zClearance,
    }))
    .query(async ({ input }) => {
      const persistedObjects = await getIurgObjects();
      const cleared = filterByClearance(persistedObjects, input.clearance);
      const pool = input.provenanceValidOnly
        ? cleared.filter((o) => o.provenance && o.provenance.type !== "SYNTHETIC" && !!o.provenance.citation)
        : cleared;
      const result = bm25Search(buildInvertedIndex(pool), pool, input.query, input.limit);
      return {
        query: input.query,
        model: "bm25",
        clearance: input.clearance,
        corpusSize: persistedObjects.length,
        accessible: cleared.length,
        searched: pool.length,
        candidates: result.candidates,
        returned: result.hits.length,
        results: result.hits,
      };
    }),

  // --- Inverted-index stats: measured structure size (docs, vocabulary,
  //     postings, avg doc length, top terms by document frequency). ---
  corpusIndexStats: publicQuery
    .input(z.object({ clearance: zClearance }).optional())
    .query(async ({ input }) => {
      const persistedObjects = await getIurgObjects();
      const cleared = filterByClearance(persistedObjects, input?.clearance ?? "PUBLIC");
      return indexStats(buildInvertedIndex(cleared));
    }),

  // --- Vector retrieval: classic TF-IDF vector-space model (cosine similarity)
  //     over persisted objects. Honestly labelled — real term weights, NOT
  //     neural embeddings. Each hit stays CITED + explainable (matchedTerms). ---
  corpusVectorSearch: publicQuery
    .input(z.object({
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(50).default(10),
      provenanceValidOnly: z.boolean().default(false),
      clearance: zClearance,
    }))
    .query(async ({ input }) => {
      const persistedObjects = await getIurgObjects();
      const cleared = filterByClearance(persistedObjects, input.clearance);
      const pool = input.provenanceValidOnly
        ? cleared.filter((o) => o.provenance && o.provenance.type !== "SYNTHETIC" && !!o.provenance.citation)
        : cleared;
      const results = vectorSearchCorpus(pool, input.query, input.limit);
      return {
        query: input.query,
        model: "tf-idf-cosine",
        clearance: input.clearance,
        corpusSize: persistedObjects.length,
        accessible: cleared.length,
        withheld: persistedObjects.length - cleared.length,
        searched: pool.length,
        returned: results.length,
        results,
      };
    }),

  // --- Retention preview (dry-run): report what a retention policy WOULD prune
  //     from the corpus and the measured before/after, WITHOUT mutating. Only
  //     corpus- records are considered; provenance-valid records are never
  //     eligible for pruning. ---
  corpusRetentionPreview: publicQuery
    .input(zRetentionPolicy.optional())
    .query(async ({ input }) => {
      const persistedObjects = await getIurgObjects();
      const corpusObjects = persistedObjects.filter((o) => (o.id ?? "").startsWith("corpus-"));
      const plan = planRetention(corpusObjects, input ?? {});
      return { applied: false, ...plan };
    }),

  // --- Retention apply (mutation): prune synthetic / low-quality NON-cited
  //     corpus records, ALWAYS preserving provenance-valid records. Scoped to
  //     the corpus- id prefix so nothing else is touched. Measured + logged. ---
  corpusRetentionApply: publicQuery
    .input(zRetentionPolicy.optional())
    .mutation(async ({ input }) => {
      const persistedObjects = await getIurgObjects();
      const corpusObjects = persistedObjects.filter((o) => (o.id ?? "").startsWith("corpus-"));
      const plan = planRetention(corpusObjects, input ?? {});
      const kept = applyRetention(corpusObjects, input ?? {});
      await replaceIurgObjectsByIdPrefix("corpus-", kept);
      if (plan.prunedIds.length > 0) {
        await appendContinuityLog({
          tick: 0,
          eventType: "DECAY",
          detail: `CORPUS_RETENTION:pruned=${plan.prunedIds.length}:synthetic=${plan.prunedByReason.synthetic}:lowQuality=${plan.prunedByReason.lowQuality}:provenanceValidPreserved=${plan.provenanceValidPreserved}`,
        });
      }
      return { applied: true, ...plan };
    }),

  // --- Live health for IUC + Living Loop scheduler ---
  health: publicQuery.query(async () => {
    const [stats, runtime] = await Promise.all([
      getIucHealthStats(),
      Promise.resolve(getIucRuntimeStatus()),
    ]);

    return {
      objectCount: stats.objectCount,
      snapshotCount: stats.snapshotCount,
      continuityLogCount: stats.continuityLogCount,
      lastTickAt: runtime.lastTickAt ?? stats.lastTickAt?.toISOString() ?? null,
      cronStatus: runtime.cronStatus,
      uptimeSeconds: process.uptime(),
    };
  }),

  // --- Run the 7 validation gates on an object without storing it (§2.3) ---
  validate: publicQuery.input(zObject).query(({ input }) => validationGates(toInput(input))),

  // --- Check ladder promotion eligibility for an object (§2.2) ---
  promote: publicQuery.input(zObject).query(({ input }) => checkPromotion(toInput(input))),

  // --- The live IURG graph (all objects with current ranks) ---
  graph: publicQuery.query(() =>
    graph.list().map((n) => ({
      id: n.id, type: n.type, rank: n.rank,
      verification: n.verification ?? "UNVERIFIED",
      trust: n.trust ?? 0, sources: n.sources ?? 0, overrides: n.overrides ?? 0,
      contribution: Math.round(objectIUC(n) * 10000) / 10000,
    })),
  ),

  // --- Apply a promotion attempt (auto rungs promote; human rungs go PENDING) ---
  applyPromotion: publicQuery.input(z.object({ id: z.string(), actor: z.string().optional() }))
    .mutation(({ input }) => graph.attemptPromotion(input.id, input.actor ?? "system")),

  // --- Approve a pending human-gated promotion (DG-09 / DG-10 / FOUNDER_CONSENSUS) ---
  approveGate: publicQuery.input(z.object({ id: z.string(), gate: z.string(), approver: z.string() }))
    .mutation(({ input }) => graph.approve(input.id, input.gate, input.approver)),

  // --- Reject a pending human-gated promotion ---
  rejectGate: publicQuery.input(z.object({ id: z.string(), gate: z.string(), approver: z.string(), reason: z.string().optional() }))
    .mutation(({ input }) => graph.reject(input.id, input.gate, input.approver, input.reason ?? "rejected")),

  // --- Pending human-gated promotions awaiting approval ---
  pending: publicQuery.query(() => graph.getPending()),

  // --- The content-addressed continuity hash chain (audit trail) ---
  chain: publicQuery.input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional())
    .query(({ input }) => {
      const all = graph.getChain();
      const limit = input?.limit ?? 100;
      return { total: all.length, entries: all.slice(-limit) };
    }),

  // --- Verify chain integrity (tamper / reorder detection) ---
  verifyChain: publicQuery.query(() => graph.verifyChain()),

  // --- Graph + chain stats ---
  stats: publicQuery.query(() => {
    const snap = computeIUC(graph.list());
    const green = snap.indicators.filter((i) => i.status === "GREEN").length;
    const g = graph.stats();
    return {
      objectCount: g.objectCount,
      tuc: snap.tuc,
      indicatorsGreen: green,
      indicatorsTotal: snap.indicators.length,
      historyLength: tucHistory.length,
      chainLength: g.chainLength,
      pendingCount: g.pendingCount,
      chainValid: g.chainValid,
    };
  }),

  // --- Reset the graph to the seed state (dev/testing) ---
  reset: publicQuery.mutation(async () => {
    graph = seedGraph();
    tucHistory.length = 0;
    await replaceIurgObjects(seedObjects);
    await clearIucSnapshots();
    await clearContinuityLogEntries();
    return { reset: true, objectCount: graph.list().length };
  }),
});
