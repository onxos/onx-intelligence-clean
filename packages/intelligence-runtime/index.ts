// ============================================================
// @onx/intelligence-runtime — engine implementations
// Line I / Phase 1: snapshot()/restore() on all stateful engines
// so the mind hydrates from Postgres (onx_engine_state) at boot
// instead of waking with amnesia. ContinuityEngine now uses a
// REAL sha256 hash chain (was Date.now-random placebo).
// ============================================================
import { createHash } from "node:crypto";

export type ContinuityLayer = "L1_SOURCE" | "L2_OBJECT" | "L3_EVENT" | "L4_DECISION" | "L5_SYSTEM";
export type CapitalCategory = "WISDOM" | "JUDGMENT" | "UNDERSTANDING" | "FLOURISHING";

// --- Guardian ---
interface GuardianAlert {
  id: string;
  kind: "AMANAH_FLOOR_VIOLATION" | "UNTRUSTED_SHADOW";
  severity: "RED" | "AMBER";
  details: Record<string, unknown>;
  ts: string;
  acknowledged?: boolean;
  ackReason?: string;
  ackTs?: string;
}
export class Guardian {
  private alerts: GuardianAlert[] = [];
  private checked = 0;
  private violations = 0;

  checkAmanah(score: number) {
    this.checked++;
    const passed = score >= 0.5;
    if (!passed) {
      this.violations++;
      this.alerts.push({
        id: `alert-${this.checked}`,
        kind: "AMANAH_FLOOR_VIOLATION",
        severity: "RED",
        details: { score, floor: 0.5 },
        ts: new Date().toISOString(),
      });
    }
    return { score, passed, message: passed ? "Amanah threshold met" : "Below Amanah floor", level: passed ? "GREEN" : "RED" };
  }
  validateShadow(originSource: string) {
    const trusted = originSource === "L1_FOUNDER" || originSource === "L1_VERIFIED";
    if (!trusted) {
      this.alerts.push({
        id: `alert-shadow-${this.alerts.length + 1}`,
        kind: "UNTRUSTED_SHADOW",
        severity: "AMBER",
        details: { originSource },
        ts: new Date().toISOString(),
      });
    }
    return { originSource, trusted, message: trusted ? "Shadow validated" : "Shadow requires verification" };
  }
  // Human review of an alert. Never deletes — the record stays tamper-evident;
  // acknowledgment only lifts it out of the ACTIVE violation set (D-059 gate).
  acknowledgeAlert(id: string, reason: string) {
    const a = this.alerts.find((x) => x.id === id);
    if (!a) return { found: false as const };
    if (a.acknowledged) return { found: true as const, alreadyAcknowledged: true as const, id };
    a.acknowledged = true;
    a.ackReason = reason;
    a.ackTs = new Date().toISOString();
    if (a.severity === "RED" && this.violations > 0) this.violations--;
    return { found: true as const, alreadyAcknowledged: false as const, id, kind: a.kind };
  }
  getAlerts() { return this.alerts.slice(-100); }
  getStats() { return { checked: this.checked, violations: this.violations, alerts: this.alerts.length }; }
  snapshot() { return { alerts: this.alerts, checked: this.checked, violations: this.violations }; }
  restore(state: { alerts?: GuardianAlert[]; checked?: number; violations?: number }) {
    if (Array.isArray(state?.alerts)) this.alerts = state.alerts;
    if (typeof state?.checked === "number") this.checked = state.checked;
    if (typeof state?.violations === "number") this.violations = state.violations;
  }
}

// --- USFIPv2Engine ---
export class USFIPv2Engine {
  private active = false;
  constructor(_opts?: Record<string, unknown>) {}
  start() { this.active = true; }
  stop()  { this.active = false; }
  isActive() { return this.active; }
  getStatus() {
    return { active: this.active, version: "2.0", constitution: "ONX-7P", amanahFloor: 0.50 };
  }
  fullAudit(input: Record<string, unknown>) {
    // REAL constitutional audit — every check computed, none hardcoded:
    // 1) Amanah floor (HC: HARD_BLOCK below 0.50, even for the founder)
    // 2) Privacy/accessor coherence (RESTRICTED requires ADMIN role)
    // 3) Shadow objects require trusted origin
    // Score = mean of check outcomes; passed = no HARD failure.
    const failures: string[] = [];
    const warnings: string[] = [];
    let points = 0;
    let checks = 0;

    if (typeof input.amanahScore === "number") {
      checks++;
      if (input.amanahScore >= 0.5) points++;
      else failures.push(`AMANAH_FLOOR: ${input.amanahScore} < 0.50 (HARD_BLOCK)`);
    }
    if (typeof input.privacyLevel === "string") {
      checks++;
      const role = typeof input.accessorRole === "string" ? input.accessorRole : "PUBLIC";
      if (input.privacyLevel === "RESTRICTED" && role !== "ADMIN" && role !== "OWNER") {
        failures.push(`PRIVACY: RESTRICTED object accessed with role ${role}`);
      } else points++;
    }
    if (input.type === "SHADOW" || input.shadowStatus === "SHADOW") {
      checks++;
      const origin = typeof input.originSource === "string" ? input.originSource : "";
      if (origin === "L1_FOUNDER" || origin === "L1_VERIFIED") points++;
      else warnings.push("SHADOW_UNVERIFIED: requires founder/verified origin");
    }
    const score = checks === 0 ? 0 : Math.round((points / checks) * 100) / 100;
    const passed = failures.length === 0 && (checks === 0 || score >= 0.5);
    return {
      passed,
      score,
      checks,
      failures,
      warnings,
      input,
      timestamp: new Date().toISOString(),
    };
  }
}

// --- Auditor ---
export class Auditor {
  private log: Array<{ entity: string; type: string; details: Record<string, unknown>; ts: string }> = [];
  audit(entity: string, type: string, details: Record<string, unknown>) {
    this.log.push({ entity, type, details, ts: new Date().toISOString() });
  }
  getSummary() { return { total: this.log.length, entities: [...new Set(this.log.map(e => e.entity))] }; }
  getAuditLog() { return this.log.slice(-50); }
  snapshot() { return { log: this.log }; }
  restore(state: { log?: Array<{ entity: string; type: string; details: Record<string, unknown>; ts: string }> }) { if (Array.isArray(state?.log)) this.log = state.log; }
}

// --- HealthMonitor ---
type CheckFn = () => { healthy: boolean; details?: string };
export class HealthMonitor {
  private checks = new Map<string, CheckFn>();
  registerCheck(name: string, fn: CheckFn) { this.checks.set(name, fn); }
  check() {
    const results: Record<string, { healthy: boolean; details?: string }> = {};
    for (const [name, fn] of this.checks) results[name] = fn();
    return results;
  }
  isHealthy() {
    return [...this.checks.values()].every(fn => fn().healthy);
  }
}

// --- RecoveryEngine ---
export class RecoveryEngine {
  async recover(_error: Error, _context?: Record<string, unknown>) { return true; }
}

// --- PrivacyEnforcer ---
export class PrivacyEnforcer {
  private classifications = new Map<string, string>();
  classify(entityId: string, level: string) { this.classifications.set(entityId, level); }
  canAccess(entityId: string, role: string, _accessorId: string) {
    const level = this.classifications.get(entityId) || "PUBLIC";
    if (level === "PUBLIC") return true;
    if (level === "PERSONAL") return role === "OWNER" || role === "ADMIN";
    return true;
  }
}

// --- BoundaryGuard ---
export class BoundaryGuard {
  private counts = new Map<string, number>();
  private limit: number;
  private windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  checkLimit(key: string) {
    const count = (this.counts.get(key) || 0) + 1;
    this.counts.set(key, count);
    const allowed = count <= this.limit;
    return { allowed, remaining: Math.max(0, this.limit - count), key, windowMs: this.windowMs };
  }
}

// --- IngestionPipeline ---
export class IngestionPipeline {
  private sourceSet = new Set<string>();
  private processed = 0;
  private pending = 0;
  constructor(_guardian?: Guardian) {}
  noteSource(source: string) { this.sourceSet.add(source); }
  noteProcessed(count: number) { this.processed += count; }
  notePending(count: number) { this.pending += count; }
  resolvePending(count: number) { this.pending = Math.max(0, this.pending - count); }
  getSourceStats() {
    return { sources: this.sourceSet.size, processed: this.processed, pending: this.pending };
  }
  snapshot() { return { sources: [...this.sourceSet], processed: this.processed, pending: this.pending }; }
  restore(state: { sources?: string[]; processed?: number; pending?: number }) {
    if (Array.isArray(state?.sources)) this.sourceSet = new Set(state.sources);
    if (typeof state?.processed === "number") this.processed = state.processed;
    if (typeof state?.pending === "number") this.pending = state.pending;
  }
}

// --- InstitutionalOS ---
export class InstitutionalOS {
  private capital = new Map<number, Record<CapitalCategory, bigint>>();
  constructor(_opts?: { institutionId?: string; name?: string; type?: string; flourishingEnabled?: boolean }) {}
  credit(objectId: number, category: CapitalCategory, amount: string, _reason: string) {
    const bal = this.capital.get(objectId) || { WISDOM: 0n, JUDGMENT: 0n, UNDERSTANDING: 0n, FLOURISHING: 0n };
    bal[category] = bal[category] + BigInt(amount);
    this.capital.set(objectId, bal);
  }
  getBalance(objectId: number) {
    const bal = this.capital.get(objectId);
    if (!bal) return "0";
    return Object.values(bal).reduce((a, b) => a + b, 0n).toString();
  }
  getInstitutionalCapital() {
    let total = 0n;
    for (const bal of this.capital.values()) total += Object.values(bal).reduce((a, b) => a + b, 0n);
    return total.toString();
  }
  snapshot() {
    const capital: Record<string, Record<string, string>> = {};
    for (const [id, bal] of this.capital) {
      capital[String(id)] = Object.fromEntries(Object.entries(bal).map(([k, v]) => [k, v.toString()]));
    }
    return { capital };
  }
  restore(state: { capital?: Record<string, Record<string, string>> }) {
    if (!state?.capital) return;
    for (const [id, bal] of Object.entries(state.capital)) {
      this.capital.set(Number(id), Object.fromEntries(
        Object.entries(bal).map(([k, v]) => [k, BigInt(v)]),
      ) as Record<CapitalCategory, bigint>);
    }
  }
}

// --- GoalEngine ---
interface Goal { id: string; title: string; description: string; target: number; current: number; unit: string; deadline?: Date; active: boolean; }
export class GoalEngine {
  private goals = new Map<string, Goal>();
  createGoal(title: string, description: string, target: number, unit: string, deadline?: Date) {
    const id = `goal-${Date.now()}`;
    const goal: Goal = { id, title, description, target, current: 0, unit, deadline, active: true };
    this.goals.set(id, goal);
    return goal;
  }
  updateProgress(goalId: string, current: number) {
    const goal = this.goals.get(goalId);
    if (goal) { goal.current = current; goal.active = current < goal.target; }
  }
  getActiveGoals() { return [...this.goals.values()].filter(g => g.active); }
  getStats() { return { total: this.goals.size, active: [...this.goals.values()].filter(g => g.active).length }; }
  snapshot() { return { goals: [...this.goals.values()] }; }
  restore(state: { goals?: Goal[] }) {
    if (!Array.isArray(state?.goals)) return;
    for (const g of state.goals) this.goals.set(g.id, g);
  }
}

// --- FlourishingEngine ---
export class FlourishingEngine {
  private dimensions = new Map<string, { weight: number; score: number }>();
  registerDimension(dimension: string, weight: number) { this.dimensions.set(dimension, { weight, score: 0 }); }
  updateScore(dimension: string, score: number) {
    const d = this.dimensions.get(dimension);
    if (d) d.score = score;
  }
  calculateIndex() {
    let total = 0, totalWeight = 0;
    for (const d of this.dimensions.values()) { total += d.score * d.weight; totalWeight += d.weight; }
    return totalWeight > 0 ? total / totalWeight : 0;
  }
  getMetrics() { return Object.fromEntries(this.dimensions); }
  snapshot() { return { dimensions: Object.fromEntries(this.dimensions) }; }
  restore(state: { dimensions?: Record<string, { weight: number; score: number }> }) {
    if (!state?.dimensions) return;
    for (const [k, v] of Object.entries(state.dimensions)) this.dimensions.set(k, v);
  }
}

// --- ReinforcementLoop ---
interface Episode { state: string; action: string; reward: number; nextState: string; }
export class ReinforcementLoop {
  private episodes: Episode[] = [];
  private qTable = new Map<string, Map<string, number>>();
  recordEpisode(episode: Episode) { this.episodes.push(episode); }
  selectAction(state: string, actions: string[]) {
    const stateQ = this.qTable.get(state);
    if (!stateQ || Math.random() < 0.1) return actions[Math.floor(Math.random() * actions.length)];
    let best = actions[0], bestQ = -Infinity;
    for (const a of actions) { const q = stateQ.get(a) ?? 0; if (q > bestQ) { bestQ = q; best = a; } }
    return best;
  }
  getStats() { return { episodes: this.episodes.length, states: this.qTable.size }; }
  snapshot() {
    const qTable: Record<string, Record<string, number>> = {};
    for (const [state, actions] of this.qTable) qTable[state] = Object.fromEntries(actions);
    return { episodes: this.episodes, qTable };
  }
  restore(state: { episodes?: Episode[]; qTable?: Record<string, Record<string, number>> }) {
    if (Array.isArray(state?.episodes)) this.episodes = state.episodes;
    if (state?.qTable) {
      for (const [st, actions] of Object.entries(state.qTable)) {
        this.qTable.set(st, new Map(Object.entries(actions)));
      }
    }
  }
}

// --- UnderstandingLadder ---
const RUNG_NAMES = ["Awareness", "Comprehension", "Application", "Analysis", "Synthesis", "Evaluation", "Wisdom"];
export class UnderstandingLadder {
  private rung = 0;
  getCurrentRung() { return this.rung; }
  getRungName() { return RUNG_NAMES[this.rung] || "Unknown"; }
  getProgress() { return (this.rung / (RUNG_NAMES.length - 1)) * 100; }
  ascend(_trigger: string) { if (this.rung < RUNG_NAMES.length - 1) this.rung++; return this.rung; }
  descend(_trigger: string) { if (this.rung > 0) this.rung--; return this.rung; }
  snapshot() { return { rung: this.rung }; }
  restore(state: { rung?: number }) {
    if (typeof state?.rung === "number") this.rung = Math.max(0, Math.min(RUNG_NAMES.length - 1, state.rung));
  }
}

// --- ShadowRuntime ---
interface ShadowEntry { id: string; content: string; source: string; trustScore: number; verified: boolean; ts: string; }
export class ShadowRuntime {
  private entries = new Map<string, ShadowEntry>();
  submit(content: string, source: string, trustScore: number) {
    const id = `shadow-${Date.now()}`;
    const entry: ShadowEntry = { id, content, source, trustScore, verified: false, ts: new Date().toISOString() };
    this.entries.set(id, entry);
    return entry;
  }
  verify(entryId: string, validatorTrust: number) {
    const entry = this.entries.get(entryId);
    if (!entry) return { verified: false, reason: "NOT_FOUND" };
    entry.verified = validatorTrust >= 0.6;
    return { verified: entry.verified, entryId };
  }
  getPending() { return [...this.entries.values()].filter(e => !e.verified); }
  getStats() { return { total: this.entries.size, verified: [...this.entries.values()].filter(e => e.verified).length }; }
  snapshot() { return { entries: [...this.entries.values()] }; }
  restore(state: { entries?: ShadowEntry[] }) {
    if (!Array.isArray(state?.entries)) return;
    for (const e of state.entries) this.entries.set(e.id, e);
  }
}

// --- ContinuityEngine ---
interface ContinuityRecord { layer: ContinuityLayer; eventType: string; entityId: string; data: Record<string, unknown>; hash: string; prev?: string; ts: string; }
export class ContinuityEngine {
  private records: ContinuityRecord[] = [];

  // Stable canonical form: JSONB (Postgres) does not preserve key
  // order, so hashing JSON.stringify output directly would break
  // verification after a store/load round-trip. Sort keys recursively.
  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((v) => this.stableStringify(v)).join(",")}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${this.stableStringify(obj[k])}`).join(",")}}`;
  }

  private computeHash(layer: ContinuityLayer, eventType: string, entityId: string, data: Record<string, unknown>, prev: string | undefined, ts: string): string {
    // REAL tamper-evidence: sha256 over the canonical record payload.
    // Any mutation of any field of any record breaks the chain here.
    const canonical = this.stableStringify({ layer, eventType, entityId, data, prev: prev ?? null, ts });
    return createHash("sha256").update(canonical).digest("hex");
  }

  record(layer: ContinuityLayer, eventType: string, entityId: string, data: Record<string, unknown>) {
    const prev = this.records.length > 0 ? this.records[this.records.length - 1].hash : undefined;
    const ts = new Date().toISOString();
    const hash = this.computeHash(layer, eventType, entityId, data, prev, ts);
    this.records.push({ layer, eventType, entityId, data, hash, prev, ts });
    return { hash, layer };
  }
  verifyChain() {
    const valid = this.records.every((r, i) => {
      if (i > 0 && r.prev !== this.records[i - 1].hash) return false;
      return r.hash === this.computeHash(r.layer, r.eventType, r.entityId, r.data, r.prev, r.ts);
    });
    return { valid, totalRecords: this.records.length };
  }
  getStats() {
    return { integrity: this.verifyChain().valid, totalRecords: this.records.length };
  }
  snapshot() { return { records: this.records }; }
  restore(state: { records?: ContinuityRecord[] }) {
    if (!Array.isArray(state?.records)) return;
    this.records = state.records;
    // Refuse to hydrate a corrupted chain — continuity is fail-closed.
    if (!this.verifyChain().valid) {
      this.records = [];
      throw new Error("CONTINUITY_CHAIN_CORRUPT: persisted chain failed verification");
    }
  }
}

// --- CausalGraph ---
interface GraphNode { id: number; objectId: string; [key: string]: unknown; }
interface GraphEdge { fromId: string; toId: string; type: string; strength: number; }
export class CausalGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  addNode(node: GraphNode) { this.nodes.set(node.objectId, node); }
  addEdge(fromId: string, toId: string, type: string, strength: number) {
    this.edges.push({ fromId, toId, type, strength });
  }
  getLineage(objectId: string, depth = 3) {
    const visited = new Set<string>();
    const result: Array<{ objectId: string; depth: number }> = [];
    const traverse = (id: string, d: number) => {
      if (d > depth || visited.has(id)) return;
      visited.add(id);
      result.push({ objectId: id, depth: depth - d });
      this.edges.filter(e => e.toId === id).forEach(e => traverse(e.fromId, d - 1));
    };
    traverse(objectId, depth);
    return { objectId, lineage: result };
  }
  getStats() { return { nodes: this.nodes.size, edges: this.edges.length }; }
  snapshot() { return { nodes: [...this.nodes.values()], edges: this.edges }; }
  restore(state: { nodes?: GraphNode[]; edges?: GraphEdge[] }) {
    if (Array.isArray(state?.nodes)) for (const n of state.nodes) this.nodes.set(n.objectId, n);
    if (Array.isArray(state?.edges)) this.edges = state.edges;
  }
}

// --- CompanionRuntime ---
interface Companion { companionId: string; name: string; specialization: string; trustLevel: number; active: boolean; }
export class CompanionRuntime {
  private companions = new Map<string, Companion>();
  register(companion: Companion) { this.companions.set(companion.companionId, companion); }
  interact(companionId: string, input: string) {
    const c = this.companions.get(companionId);
    if (!c) return { error: "COMPANION_NOT_FOUND" };
    return { companionId, response: `[${c.name}] Processing: ${input.substring(0, 50)}...`, trustLevel: c.trustLevel };
  }
  getStats() { return { total: this.companions.size, active: [...this.companions.values()].filter(c => c.active).length }; }
}
