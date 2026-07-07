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

// --- In-memory IURG store, seeded with a realistic mini-graph ---
function seedStore(): IurgObjectInput[] {
  return [
    { id: "seed-fi", type: "FOUNDER_INTENT", rank: 6, verification: "PROVEN", amanah: 1.0, founderAlignment: 1.0, validated: true, sources: 3, trust: 0.98, transfer: 0.9 },
    { id: "seed-cc", type: "CONSTITUTIONAL_CONSTRAINT", rank: 6, verification: "PROVEN", amanah: 1.0, founderAlignment: 1.0, validated: true, sources: 3, trust: 0.97, transfer: 0.85 },
    { id: "seed-perc", type: "PERCEPTION", rank: 1, verification: "POSSIBLE", amanah: 0.7, founderAlignment: 0.7, sources: 2, trust: 0.62, transfer: 0.55, ageDays: 1 },
    { id: "seed-patt", type: "PATTERN", rank: 2, verification: "PROBABLE", amanah: 0.8, founderAlignment: 0.75, validated: true, sources: 3, trust: 0.78, transfer: 0.7 },
    { id: "seed-und", type: "UNDERSTANDING", rank: 3, verification: "CONFIRMED", amanah: 0.9, founderAlignment: 0.85, validated: true, sources: 3, trust: 0.82, transfer: 0.75 },
    { id: "seed-judg", type: "JUDGMENT", rank: 4, verification: "CONFIRMED", amanah: 0.95, founderAlignment: 0.9, validated: true, sources: 4, trust: 0.88, transfer: 0.8, yield: 0.9 },
    { id: "seed-dec", type: "DECISION", rank: 3, verification: "PROBABLE", amanah: 0.9, founderAlignment: 0.88, validated: true, sources: 2, trust: 0.8, transfer: 0.72, yield: 0.8 },
    { id: "seed-out", type: "OUTCOME", rank: 4, verification: "PROVEN", amanah: 0.96, founderAlignment: 0.92, validated: true, sources: 3, trust: 0.9, transfer: 0.82, yield: 0.95 },
    { id: "seed-evi", type: "EVIDENCE", rank: 2, verification: "CONFIRMED", amanah: 0.9, founderAlignment: 0.8, validated: true, sources: 3, trust: 0.85, transfer: 0.6 },
    { id: "seed-val", type: "VALIDATION", rank: 3, verification: "PROVEN", amanah: 0.92, founderAlignment: 0.85, validated: true, sources: 3, trust: 0.86, transfer: 0.65 },
  ];
}

let store: IurgObjectInput[] = seedStore();
const tucHistory: number[] = [];

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

  // --- Live IUC snapshot: TUC + 11 indicators over current store (§2.4) ---
  snapshot: publicQuery
    .input(z.object({ previousTUC: z.number().optional() }).optional())
    .query(({ input }) => {
      const previousTUC = input?.previousTUC ?? (tucHistory.length ? tucHistory[tucHistory.length - 1] : undefined);
      return computeIUC(store, { previousTUC });
    }),

  // --- Commit a snapshot to history (daily iuc.snapshot event) ---
  commit: publicQuery.mutation(() => {
    const previousTUC = tucHistory.length ? tucHistory[tucHistory.length - 1] : undefined;
    const snap = computeIUC(store, { previousTUC });
    tucHistory.push(snap.tuc);
    return { snapshot: snap, historyLength: tucHistory.length };
  }),

  // --- Ingest an IURG object: contribution + VG + promotion eligibility ---
  ingest: publicQuery.input(zObject).mutation(({ input }) => {
    const obj = toInput(input);
    store.push(obj);
    return {
      stored: true,
      objectCount: store.length,
      contribution: Math.round(objectIUC(obj) * 10000) / 10000,
      validation: validationGates(obj),
      promotion: checkPromotion(obj),
      snapshot: computeIUC(store),
    };
  }),

  // --- Run the 7 validation gates on an object without storing it (§2.3) ---
  validate: publicQuery.input(zObject).query(({ input }) => validationGates(toInput(input))),

  // --- Check ladder promotion eligibility for an object (§2.2) ---
  promote: publicQuery.input(zObject).query(({ input }) => checkPromotion(toInput(input))),

  // --- Store stats ---
  stats: publicQuery.query(() => {
    const snap = computeIUC(store);
    const green = snap.indicators.filter((i) => i.status === "GREEN").length;
    return {
      objectCount: store.length,
      tuc: snap.tuc,
      indicatorsGreen: green,
      indicatorsTotal: snap.indicators.length,
      historyLength: tucHistory.length,
    };
  }),

  // --- Reset the store to the seed graph (dev/testing) ---
  reset: publicQuery.mutation(() => {
    store = seedStore();
    tucHistory.length = 0;
    return { reset: true, objectCount: store.length };
  }),
});
