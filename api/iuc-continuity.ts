// ============================================================
// IUC CONTINUITY + PROMOTION ENGINE (Track I / I-M2)
// A stateful IURG graph over the pure IUC engine (api/iuc-engine.ts):
//   - live IURG objects held in a graph (single source of truth)
//   - content-addressed hash-chain continuity (sha256, tamper-evident)
//   - R1->R6 promotion state machine with human gates
//     (AUTO for R1->R2/R2->R3, DG-09 / DG-10 / FOUNDER_CONSENSUS above)
// Pure + in-memory + deterministic (no DB) → fully CI-testable.
// DB persistence is layered on top later (staging phase).
// ============================================================
import { createHash } from "crypto";
import {
  checkPromotion,
  type IurgObjectInput,
  type IurgObjectType,
  type Rank,
} from "./iuc-engine";

const GENESIS = "0".repeat(64);

export type ContinuityEventType =
  | "OBJECT_CREATED"
  | "PROMOTION_AUTO"
  | "PROMOTION_PENDING"
  | "PROMOTION_APPROVED"
  | "PROMOTION_REJECTED";

export interface ContinuityEntry {
  index: number;
  eventType: ContinuityEventType;
  objectId: string;
  fromRank: Rank | null;
  toRank: Rank | null;
  gate: string;
  actor: string;
  detail: string;
  timestamp: string;
  prevHash: string;
  hash: string;
}

export interface IurgNode extends IurgObjectInput {
  id: string;
  type: IurgObjectType;
  rank: Rank;
}

export interface PendingPromotion {
  objectId: string;
  fromRank: Rank;
  toRank: Rank;
  gate: string;
  requestedAt: string;
}

export type PromotionStatus = "PROMOTED" | "PENDING" | "INELIGIBLE" | "NOT_FOUND";

export interface PromotionOutcome {
  status: PromotionStatus;
  objectId: string;
  fromRank: Rank | null;
  newRank: Rank | null;
  gate: string;
  humanApprovalRequired: boolean;
  reason: string;
}

export interface ApprovalOutcome {
  approved: boolean;
  objectId: string;
  newRank: Rank | null;
  gate: string;
  reason: string;
}

export interface ChainVerification {
  valid: boolean;
  length: number;
  brokenAt: number | null;
}

/** Canonical sha256 over the entry's fields (excluding its own hash). */
function hashEntry(e: Omit<ContinuityEntry, "hash">): string {
  const canonical = JSON.stringify([
    e.index, e.eventType, e.objectId, e.fromRank, e.toRank,
    e.gate, e.actor, e.detail, e.timestamp, e.prevHash,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export class IurgContinuityGraph {
  private nodes = new Map<string, IurgNode>();
  private chain: ContinuityEntry[] = [];
  private pending = new Map<string, PendingPromotion>();
  private seq = 0;

  private append(
    eventType: ContinuityEventType, objectId: string,
    fromRank: Rank | null, toRank: Rank | null,
    gate: string, actor: string, detail: string,
  ): ContinuityEntry {
    const index = this.chain.length;
    const last = this.chain[index - 1];
    const prevHash = index === 0 ? GENESIS : (last ? last.hash : GENESIS);
    const base: Omit<ContinuityEntry, "hash"> = {
      index, eventType, objectId, fromRank, toRank, gate, actor, detail,
      timestamp: new Date().toISOString(), prevHash,
    };
    const entry: ContinuityEntry = { ...base, hash: hashEntry(base) };
    this.chain.push(entry);
    return entry;
  }

  addObject(input: IurgObjectInput, actor = "system"): IurgNode {
    const id = input.id ?? `iurg-${++this.seq}`;
    const rank = (input.rank ?? 1) as Rank;
    const node: IurgNode = { ...input, id, type: input.type, rank };
    this.nodes.set(id, node);
    this.append("OBJECT_CREATED", id, null, rank, "AUTO", actor, `created ${node.type} at R${rank}`);
    return node;
  }

  get(id: string): IurgNode | undefined { return this.nodes.get(id); }
  list(): IurgNode[] { return [...this.nodes.values()]; }
  getPending(): PendingPromotion[] { return [...this.pending.values()]; }
  getChain(): ContinuityEntry[] { return this.chain.slice(); }

  /** Attempt to promote an object one rung. Human-gated rungs become PENDING. */
  attemptPromotion(id: string, actor = "system"): PromotionOutcome {
    const node = this.nodes.get(id);
    if (!node) {
      return { status: "NOT_FOUND", objectId: id, fromRank: null, newRank: null, gate: "NONE", humanApprovalRequired: false, reason: "object not found" };
    }
    const p = checkPromotion(node);
    if (!p.eligible || p.nextRank === null) {
      return { status: "INELIGIBLE", objectId: id, fromRank: node.rank, newRank: null, gate: p.gate, humanApprovalRequired: p.humanApprovalRequired, reason: p.reason };
    }
    if (p.humanApprovalRequired) {
      this.pending.set(id, { objectId: id, fromRank: node.rank, toRank: p.nextRank, gate: p.gate, requestedAt: new Date().toISOString() });
      this.append("PROMOTION_PENDING", id, node.rank, p.nextRank, p.gate, actor, `awaiting ${p.gate}`);
      return { status: "PENDING", objectId: id, fromRank: node.rank, newRank: null, gate: p.gate, humanApprovalRequired: true, reason: p.reason };
    }
    const from = node.rank;
    node.rank = p.nextRank;
    this.append("PROMOTION_AUTO", id, from, node.rank, p.gate, actor, `auto R${from}->R${node.rank}`);
    return { status: "PROMOTED", objectId: id, fromRank: from, newRank: node.rank, gate: p.gate, humanApprovalRequired: false, reason: p.reason };
  }

  /** Approve a pending human-gated promotion (DG-09 / DG-10 / FOUNDER_CONSENSUS). */
  approve(id: string, gate: string, approver: string): ApprovalOutcome {
    const pend = this.pending.get(id);
    if (!pend) return { approved: false, objectId: id, newRank: null, gate, reason: "no pending promotion" };
    if (pend.gate !== gate) return { approved: false, objectId: id, newRank: null, gate, reason: `gate mismatch (expected ${pend.gate})` };
    const node = this.nodes.get(id);
    if (!node) return { approved: false, objectId: id, newRank: null, gate, reason: "object not found" };
    const from = node.rank;
    node.rank = pend.toRank;
    this.pending.delete(id);
    this.append("PROMOTION_APPROVED", id, from, node.rank, gate, approver, `approved ${gate} by ${approver}`);
    return { approved: true, objectId: id, newRank: node.rank, gate, reason: `promoted R${from}->R${node.rank}` };
  }

  /** Reject a pending human-gated promotion; the object stays at its rank. */
  reject(id: string, gate: string, approver: string, reason = "rejected"): ApprovalOutcome {
    const pend = this.pending.get(id);
    if (!pend) return { approved: false, objectId: id, newRank: null, gate, reason: "no pending promotion" };
    const node = this.nodes.get(id);
    const rank = node ? node.rank : null;
    this.pending.delete(id);
    this.append("PROMOTION_REJECTED", id, rank, rank, gate, approver, `rejected ${gate}: ${reason}`);
    return { approved: false, objectId: id, newRank: rank, gate, reason: `rejected: ${reason}` };
  }

  /** Recompute the hash chain to detect tampering or reordering. */
  verifyChain(): ChainVerification {
    for (let i = 0; i < this.chain.length; i++) {
      const e = this.chain[i];
      if (!e) return { valid: false, length: this.chain.length, brokenAt: i };
      const prev = this.chain[i - 1];
      const expectedPrev = i === 0 ? GENESIS : (prev ? prev.hash : GENESIS);
      if (e.prevHash !== expectedPrev) return { valid: false, length: this.chain.length, brokenAt: i };
      const recomputed = hashEntry({
        index: e.index, eventType: e.eventType, objectId: e.objectId, fromRank: e.fromRank,
        toRank: e.toRank, gate: e.gate, actor: e.actor, detail: e.detail, timestamp: e.timestamp, prevHash: e.prevHash,
      });
      if (recomputed !== e.hash) return { valid: false, length: this.chain.length, brokenAt: i };
    }
    return { valid: true, length: this.chain.length, brokenAt: null };
  }

  stats() {
    return {
      objectCount: this.nodes.size,
      chainLength: this.chain.length,
      pendingCount: this.pending.size,
      chainValid: this.verifyChain().valid,
    };
  }
}
