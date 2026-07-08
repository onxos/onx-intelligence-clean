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

const zType = z.enum(IURG_TYPES as unknown as [IurgObjectType, ...IurgObjectType[]]);
const zVerification = z.enum(["UNVERIFIED", "POSSIBLE", "PROBABLE", "CONFIRMED", "PROVEN"]);

const zObject = z.object({
  id: z.string().optional(),
  type: zType,
  rank: z.number().int().min(1).max(6).optional(),
  verification: zVerification.optional(),
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

// --- In-memory IURG continuity graph, seeded with a realistic mini-graph ---
function seedGraph(): IurgContinuityGraph {
  const g = new IurgContinuityGraph();
  const seeds: IurgObjectInput[] = [
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
  for (const s of seeds) g.addObject(s);
  return g;
}

let graph = seedGraph();
const tucHistory: number[] = [];

/** Live IURG objects — shared with the D17 measurement engine. */
export function listLiveObjects() {
  return graph.list();
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
    .query(({ input }) => {
      const previousTUC = input?.previousTUC ?? (tucHistory.length ? tucHistory[tucHistory.length - 1] : undefined);
      return computeIUC(graph.list(), { previousTUC });
    }),

  // --- Commit a snapshot to history (daily iuc.snapshot event) ---
  commit: publicQuery.mutation(() => {
    const previousTUC = tucHistory.length ? tucHistory[tucHistory.length - 1] : undefined;
    const snap = computeIUC(graph.list(), { previousTUC });
    tucHistory.push(snap.tuc);
    return { snapshot: snap, historyLength: tucHistory.length };
  }),

  // --- Ingest an IURG object into the graph: contribution + VG + eligibility ---
  ingest: publicQuery.input(zObject).mutation(({ input }) => {
    const obj = toInput(input);
    const node = graph.addObject(obj);
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
  reset: publicQuery.mutation(() => {
    graph = seedGraph();
    tucHistory.length = 0;
    return { reset: true, objectCount: graph.list().length };
  }),
});
