// ============================================================
// OCMBR STORE — in-memory truth ledger (deterministic, no DB / keys)
//
// Holds the four OCMBR tables:
//   capabilities, implementation_units, acceptance_criteria, evidence_records
//
// Follows the codebase convention (see api/lib/iurg-store.ts): a pure
// in-memory Map-backed store with a __resetForTests() helper, so the
// whole subsystem runs in CI with zero external dependencies. A DB /
// pg persistence layer can be layered later behind the same interface.
// ============================================================
import { createHash } from "node:crypto";
import {
  computeMaturity,
  maturityRank,
  type AcceptanceCriterion,
  type CapabilityInput,
  type EvidenceKind,
  type EvidenceRecord,
  type MaturityState,
} from "./ocmbr-engine";
import { OCMBR_SEED } from "./ocmbr-seed";

export interface Capability extends CapabilityInput {
  createdAt: string;
}

export interface ImplementationUnit {
  id: string;
  capabilityCode: string;
  kind: "code" | "test" | "doc" | "demo" | "runtime";
  path: string;
  description?: string;
}

interface Store {
  capabilities: Map<string, Capability>;
  units: ImplementationUnit[];
  criteria: AcceptanceCriterion[];
  evidence: EvidenceRecord[];
  seeded: boolean;
}

const store: Store = {
  capabilities: new Map(),
  units: [],
  criteria: [],
  evidence: [],
  seeded: false,
};

function shortId(prefix: string, parts: unknown[]): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 12);
  return `${prefix}-${hash}`;
}

// --- Capabilities ---------------------------------------------------------

export function registerCapability(input: CapabilityInput): Capability {
  const existing = store.capabilities.get(input.code);
  const cap: Capability = {
    ...input,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  store.capabilities.set(input.code, cap);
  return cap;
}

export function getCapability(code: string): Capability | undefined {
  return store.capabilities.get(code);
}

export function listCapabilities(): Capability[] {
  return Array.from(store.capabilities.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
}

// --- Implementation units -------------------------------------------------

export function addUnit(input: Omit<ImplementationUnit, "id">): ImplementationUnit {
  const id = shortId("unit", [input.capabilityCode, input.kind, input.path]);
  const unit: ImplementationUnit = { ...input, id };
  const idx = store.units.findIndex((u) => u.id === id);
  if (idx >= 0) store.units[idx] = unit;
  else store.units.push(unit);
  return unit;
}

export function listUnits(code: string): ImplementationUnit[] {
  return store.units.filter((u) => u.capabilityCode === code);
}

// --- Acceptance criteria --------------------------------------------------

export function addCriterion(
  input: Omit<AcceptanceCriterion, "id"> & { id?: string },
): AcceptanceCriterion {
  const id =
    input.id ?? shortId("ac", [input.capabilityCode, input.statement]);
  const criterion: AcceptanceCriterion = {
    id,
    capabilityCode: input.capabilityCode,
    statement: input.statement,
    verifyCommand: input.verifyCommand,
  };
  const idx = store.criteria.findIndex((c) => c.id === id);
  if (idx >= 0) store.criteria[idx] = criterion;
  else store.criteria.push(criterion);
  return criterion;
}

export function listCriteria(code: string): AcceptanceCriterion[] {
  return store.criteria.filter((c) => c.capabilityCode === code);
}

// --- Evidence -------------------------------------------------------------

export interface RecordEvidenceInput {
  capabilityCode: string;
  kind: EvidenceKind;
  criterionId?: string;
  command?: string;
  output?: string;
  commit?: string;
  date?: string;
  verifier?: string;
  passed?: boolean;
}

export function recordEvidence(input: RecordEvidenceInput): EvidenceRecord {
  const date = input.date ?? new Date().toISOString();
  const id = shortId("ev", [
    input.capabilityCode,
    input.kind,
    input.criterionId ?? "",
    input.command ?? "",
    input.commit ?? "",
    date,
  ]);
  const record: EvidenceRecord = {
    id,
    capabilityCode: input.capabilityCode,
    criterionId: input.criterionId,
    kind: input.kind,
    command: input.command,
    output: input.output,
    commit: input.commit,
    date,
    verifier: input.verifier,
    passed: input.passed,
  };
  const idx = store.evidence.findIndex((e) => e.id === id);
  if (idx >= 0) store.evidence[idx] = record;
  else store.evidence.push(record);
  return record;
}

export function listEvidence(code: string): EvidenceRecord[] {
  return store.evidence.filter((e) => e.capabilityCode === code);
}

// --- Derived views --------------------------------------------------------

export interface CapabilityStatus {
  capability: Capability;
  state: MaturityState;
  labelAr: string;
  reason: string;
  signals: ReturnType<typeof computeMaturity>["signals"];
  evidenceCount: number;
  criteriaCount: number;
}

export function capabilityStatus(code: string): CapabilityStatus | undefined {
  const capability = store.capabilities.get(code);
  if (!capability) return undefined;
  const criteria = listCriteria(code);
  const evidence = listEvidence(code);
  const computed = computeMaturity(criteria, evidence);
  return {
    capability,
    state: computed.state,
    labelAr: computed.labelAr,
    reason: computed.reason,
    signals: computed.signals,
    evidenceCount: evidence.length,
    criteriaCount: criteria.length,
  };
}

export function matrix(): CapabilityStatus[] {
  return listCapabilities()
    .map((c) => capabilityStatus(c.code)!)
    .sort(
      (a, b) =>
        maturityRank(a.state) - maturityRank(b.state) ||
        a.capability.code.localeCompare(b.capability.code),
    );
}

export function summary(): {
  totalCapabilities: number;
  byState: Record<MaturityState, number>;
  totalEvidence: number;
  totalCriteria: number;
} {
  const byState: Record<MaturityState, number> = {
    MISSING: 0,
    DOCUMENTED: 0,
    DEMO: 0,
    PARTIAL: 0,
    VERIFIED: 0,
  };
  for (const s of matrix()) byState[s.state] += 1;
  return {
    totalCapabilities: store.capabilities.size,
    byState,
    totalEvidence: store.evidence.length,
    totalCriteria: store.criteria.length,
  };
}

// --- Seed -----------------------------------------------------------------

/**
 * Import the current project's real capabilities as the first ledger
 * entries. Idempotent: re-running never duplicates. Each seeded
 * capability carries only the evidence that genuinely exists, so its
 * computed state is honest (most are PARTIAL/DEMO/DOCUMENTED, not
 * VERIFIED) — the charter forbids self-certification.
 */
export function seed(force = false): { seeded: boolean; capabilities: number } {
  if (store.seeded && !force) {
    return { seeded: false, capabilities: store.capabilities.size };
  }
  for (const entry of OCMBR_SEED) {
    registerCapability(entry.capability);
    for (const unit of entry.units ?? []) {
      addUnit({ ...unit, capabilityCode: entry.capability.code });
    }
    for (const c of entry.criteria ?? []) {
      addCriterion({ ...c, capabilityCode: entry.capability.code });
    }
    for (const e of entry.evidence ?? []) {
      recordEvidence({ ...e, capabilityCode: entry.capability.code });
    }
  }
  store.seeded = true;
  return { seeded: true, capabilities: store.capabilities.size };
}

export function isSeeded(): boolean {
  return store.seeded;
}

// --- Test / reset ---------------------------------------------------------

export function __resetOcmbrForTests(): void {
  store.capabilities.clear();
  store.units.length = 0;
  store.criteria.length = 0;
  store.evidence.length = 0;
  store.seeded = false;
}
