// ============================================================
// FIC v0.2 GOVERNANCE ROUTER (M4)
// Exposes the FIC engine + an append-only, sha256 hash-chained
// Intent Evolution Ledger (MED v2.0 §1.7). In-memory, CI-safe.
// ============================================================
import { z } from "zod";
import { createHash, randomUUID } from "crypto";
import { createRouter, publicQuery } from "./middleware";
import {
  evaluateIntent,
  ALL_CONSTRAINTS,
  CONSTRAINT_COUNTS,
  OUTCOME_VERIFICATIONS,
  OVERRIDES,
  AMANAH_FLOOR,
  INTENT_CATEGORIES,
  RISKY_ACTIONS,
  RISK_FLAGS,
  EMERGENCY_TYPES,
  type IntentCategory,
  type RiskyAction,
  type RiskFlag,
  type EmergencyType,
  type FICVerdict,
} from "./fic-engine";

const zIntent = z.object({
  id: z.string().optional(),
  content: z.string().optional(),
  category: z.enum(INTENT_CATEGORIES as unknown as [IntentCategory, ...IntentCategory[]]).optional(),
  actor: z.enum(["founder", "system", "institution"]).optional(),
  action: z.enum(RISKY_ACTIONS as unknown as [RiskyAction, ...RiskyAction[]]).optional(),
  amanahScore: z.number().min(0).max(1).optional(),
  evidence: z.number().int().min(0).optional(),
  sources: z.number().int().min(0).optional(),
  usesFrontierAI: z.boolean().optional(),
  usesCorpus: z.boolean().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  founderL1: z.boolean().optional(),
  emergency: z.enum(EMERGENCY_TYPES as unknown as [EmergencyType, ...EmergencyType[]]).optional(),
  flags: z.array(z.enum(RISK_FLAGS as unknown as [RiskFlag, ...RiskFlag[]])).optional(),
});

// --- Intent Evolution Ledger — append-only, hash-chained ---
export type LedgerEventType =
  | "creation" | "evaluation" | "approval" | "rejection" | "hard_block"
  | "override" | "gate_pending" | "amendment" | "supersede" | "expiry" | "violation_detected";

interface LedgerEntry {
  seq: number;
  eventId: string;
  type: LedgerEventType;
  intentId: string;
  status: string;
  prevHash: string;
  hash: string;
  timestamp: string;
}

const GENESIS = "0".repeat(64);
let ledger: LedgerEntry[] = [];

function tipHash(): string {
  return ledger.length ? ledger[ledger.length - 1].hash : GENESIS;
}

function appendLedger(type: LedgerEventType, verdict: FICVerdict): LedgerEntry {
  const prevHash = tipHash();
  const seq = ledger.length;
  const eventId = randomUUID();
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({ seq, eventId, type, intentId: verdict.intentId, status: verdict.status, prevHash, timestamp });
  const hash = createHash("sha256").update(payload).digest("hex");
  const entry: LedgerEntry = { seq, eventId, type, intentId: verdict.intentId, status: verdict.status, prevHash, hash, timestamp };
  ledger.push(entry);
  return entry;
}

function eventTypeFor(v: FICVerdict): LedgerEventType {
  switch (v.status) {
    case "HARD_BLOCK": return "hard_block";
    case "REJECTED": return "rejection";
    case "OVERRIDE": return "override";
    case "PENDING_GATES": return "gate_pending";
    default: return "approval";
  }
}

export const ficRouter = createRouter({
  // --- Full constraint registry (68) + family counts ---
  constraints: publicQuery.query(() => ({
    counts: CONSTRAINT_COUNTS,
    amanahFloor: AMANAH_FLOOR,
    constraints: ALL_CONSTRAINTS.map((c) => ({ id: c.id, type: c.type, title: c.title })),
    outcomeVerifications: OUTCOME_VERIFICATIONS,
    overrides: Object.values(OVERRIDES),
  })),

  // --- Read-only assessment (no ledger write) ---
  assess: publicQuery.input(zIntent).query(({ input }) => evaluateIntent(input)),

  // --- Evaluate + record into the Intent Evolution Ledger ---
  evaluate: publicQuery.input(zIntent).mutation(({ input }) => {
    const verdict = evaluateIntent(input);
    const entry = appendLedger(eventTypeFor(verdict), verdict);
    return { verdict, ledger: { seq: entry.seq, hash: entry.hash, type: entry.type } };
  }),

  // --- Amanah floor quick-check ---
  amanah: publicQuery.input(z.object({ score: z.number().min(0).max(1), founderL1: z.boolean().optional() }))
    .query(({ input }) => {
      const blocked = input.score < AMANAH_FLOOR && !(input.founderL1 ?? false);
      return { score: input.score, floor: AMANAH_FLOOR, status: blocked ? "HARD_BLOCK" : "PASS" };
    }),

  // --- The append-only ledger ---
  ledger: publicQuery.query(() => ({ total: ledger.length, entries: ledger })),

  // --- Verify the ledger hash chain integrity ---
  verifyLedger: publicQuery.query(() => {
    let prev = GENESIS;
    for (const e of ledger) {
      if (e.prevHash !== prev) return { valid: false, brokenAt: e.seq };
      const payload = JSON.stringify({ seq: e.seq, eventId: e.eventId, type: e.type, intentId: e.intentId, status: e.status, prevHash: e.prevHash, timestamp: e.timestamp });
      if (createHash("sha256").update(payload).digest("hex") !== e.hash) return { valid: false, brokenAt: e.seq };
      prev = e.hash;
    }
    return { valid: true, length: ledger.length };
  }),

  reset: publicQuery.mutation(() => {
    ledger = [];
    return { reset: true };
  }),
});
