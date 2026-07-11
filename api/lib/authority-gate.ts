// ============================================================
// AUTHORITY GATE — A0–A5 authority ladder + tamper-evident audit log (B3)
//
// The constitution as RUNTIME: every authority request is EVALUATED
// (never rubber-stamped) and every decision is APPENDED to a hash-chain
// audit log. Each record's hash covers its own fields plus the previous
// record's hash, so editing any past record breaks the chain and is
// detectable by verifyChain().
//
// Charter rules enforced here:
//   • fail-CLOSED — any error / malformed input → DENIED, never granted.
//   • No auto-grant above A2 — levels A3+ require an explicit, valid owner
//     approval that itself reaches the requested level. Autonomy is capped.
//
// Pure & deterministic (in-memory, node:crypto only) so it runs in CI with
// no DB / keys, following the api/lib/ocmbr-store.ts convention.
// ============================================================
import { createHash } from "node:crypto";

export const AUTHORITY_LEVELS = ["A0", "A1", "A2", "A3", "A4", "A5"] as const;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

/** Human meaning of each rung (lowest → highest). */
export const AUTHORITY_LABEL_AR: Record<AuthorityLevel, string> = {
  A0: "مراقبة/قراءة",
  A1: "اقتراح",
  A2: "تنفيذ قابل للعكس",
  A3: "تنفيذ غير قابل للعكس/مالي",
  A4: "تغيير بنيوي/حوكمي",
  A5: "تعديل دستوري/جذري",
};

export function authorityRank(level: AuthorityLevel): number {
  return AUTHORITY_LEVELS.indexOf(level);
}

/**
 * The highest level that may EVER be granted without an explicit owner
 * approval. The charter forbids autonomy above A2, so anything higher is
 * denied unless a constitutional owner signs off to at least that level.
 */
export const AUTO_GRANT_CEILING: AuthorityLevel = "A2";

export interface OwnerApproval {
  /** Non-empty identity of the constitutional owner granting the escalation. */
  approver: string;
  /** The level this owner explicitly authorised. Must reach the request. */
  grantedLevel: AuthorityLevel;
}

export interface AuthorityRequest {
  /** Stable id; auto-derived from content when omitted. */
  requestId?: string;
  /** Who / what is asking (subject of the request). */
  subject: string;
  /** What the subject wants to do. */
  action: string;
  /** The authority level being requested. */
  requested: AuthorityLevel;
  /** Explicit owner approval — required to clear anything above A2. */
  ownerApproval?: OwnerApproval | null;
}

export type AuthorityDecision = "GRANTED" | "DENIED";

export interface AuthorityRecord {
  seq: number;
  timestamp: string;
  requestId: string;
  subject: string;
  action: string;
  requested: AuthorityLevel;
  decision: AuthorityDecision;
  reason: string;
  /** Hash of the previous record (genesis = 64 zeros). */
  prevHash: string;
  /** sha256 over this record's canonical fields + prevHash. */
  hash: string;
}

export interface ChainVerification {
  valid: boolean;
  /** seq of the first record that fails verification, or null when valid. */
  brokenAt: number | null;
  length: number;
  reason: string;
}

export const GENESIS_HASH = "0".repeat(64);

/** Fields covered by the record hash, excluding `hash` itself. */
type HashableRecord = Omit<AuthorityRecord, "hash">;

function canonical(rec: HashableRecord): string {
  return JSON.stringify([
    rec.seq,
    rec.timestamp,
    rec.requestId,
    rec.subject,
    rec.action,
    rec.requested,
    rec.decision,
    rec.reason,
    rec.prevHash,
  ]);
}

function hashRecord(rec: HashableRecord): string {
  return createHash("sha256").update(canonical(rec)).digest("hex");
}

function isValidLevel(level: unknown): level is AuthorityLevel {
  return (
    typeof level === "string" &&
    (AUTHORITY_LEVELS as readonly string[]).includes(level)
  );
}

function shortId(parts: unknown[]): string {
  return (
    "req-" +
    createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 12)
  );
}

/**
 * Pure decision function — no side effects. Decides GRANTED/DENIED for a
 * request under the charter. fail-CLOSED: malformed input is DENIED.
 */
export function decideAuthority(request: AuthorityRequest): {
  decision: AuthorityDecision;
  reason: string;
} {
  try {
    if (!request || typeof request !== "object") {
      return { decision: "DENIED", reason: "طلب غير صالح — رفض (fail-closed)." };
    }
    if (!isValidLevel(request.requested)) {
      return {
        decision: "DENIED",
        reason: `مستوى صلاحية غير معروف: «${String(
          request.requested,
        )}» — رفض (fail-closed).`,
      };
    }
    if (typeof request.subject !== "string" || request.subject.trim() === "") {
      return {
        decision: "DENIED",
        reason: "طالب الصلاحية غير محدَّد — رفض (fail-closed).",
      };
    }

    const reqRank = authorityRank(request.requested);

    // At or below the auto-grant ceiling (≤ A2): granted deterministically.
    if (reqRank <= authorityRank(AUTO_GRANT_CEILING)) {
      return {
        decision: "GRANTED",
        reason: `ضمن السقف التلقائي (${AUTO_GRANT_CEILING}) — مُنح.`,
      };
    }

    // Above A2: an explicit, valid owner approval reaching the level is required.
    const approval = request.ownerApproval;
    if (!approval || typeof approval !== "object") {
      return {
        decision: "DENIED",
        reason: `${request.requested} فوق السقف التلقائي (${AUTO_GRANT_CEILING}) ويتطلب موافقة مالك صريحة — رفض (fail-closed).`,
      };
    }
    if (typeof approval.approver !== "string" || approval.approver.trim() === "") {
      return {
        decision: "DENIED",
        reason: "موافقة المالك بلا هوية معتمِد — رفض (fail-closed).",
      };
    }
    if (!isValidLevel(approval.grantedLevel)) {
      return {
        decision: "DENIED",
        reason: "مستوى موافقة المالك غير معروف — رفض (fail-closed).",
      };
    }
    if (authorityRank(approval.grantedLevel) < reqRank) {
      return {
        decision: "DENIED",
        reason: `موافقة المالك (${approval.grantedLevel}) لا تبلغ المستوى المطلوب (${request.requested}) — رفض (fail-closed).`,
      };
    }

    return {
      decision: "GRANTED",
      reason: `مُنح ${request.requested} بموافقة مالك صريحة من «${approval.approver}».`,
    };
  } catch {
    // Any unexpected failure denies — the gate never fails open.
    return {
      decision: "DENIED",
      reason: "خطأ غير متوقع أثناء التقييم — رفض (fail-closed).",
    };
  }
}

/**
 * Append-only, tamper-evident authority gate. Instantiate per bounded
 * context; a shared singleton is exported below for the tRPC surface.
 */
export class AuthorityGate {
  private chain: AuthorityRecord[] = [];

  /** Evaluate a request, append the decision to the chain, return the record. */
  request(request: AuthorityRequest): AuthorityRecord {
    const { decision, reason } = decideAuthority(request);
    const seq = this.chain.length;
    const prevHash = seq === 0 ? GENESIS_HASH : this.chain[seq - 1].hash;
    const requested = isValidLevel(request?.requested)
      ? request.requested
      : ("A5" as AuthorityLevel); // record the most-restrictive read of an invalid level
    const base: HashableRecord = {
      seq,
      timestamp: new Date().toISOString(),
      requestId:
        request?.requestId ??
        shortId([seq, request?.subject, request?.action, requested]),
      subject: typeof request?.subject === "string" ? request.subject : "",
      action: typeof request?.action === "string" ? request.action : "",
      requested,
      decision,
      reason,
      prevHash,
    };
    const record: AuthorityRecord = { ...base, hash: hashRecord(base) };
    this.chain.push(record);
    return record;
  }

  /** A deep copy of the chain — safe to inspect or (in tests) tamper with. */
  exportChain(): AuthorityRecord[] {
    return this.chain.map((r) => ({ ...r }));
  }

  get length(): number {
    return this.chain.length;
  }

  /**
   * Recompute every hash and re-link every record. Returns the first seq
   * where recomputation or linkage disagrees — proving tamper detection.
   */
  verifyChain(chain: AuthorityRecord[] = this.chain): ChainVerification {
    for (let i = 0; i < chain.length; i++) {
      const rec = chain[i];
      const expectedPrev = i === 0 ? GENESIS_HASH : chain[i - 1].hash;
      if (rec.prevHash !== expectedPrev) {
        return {
          valid: false,
          brokenAt: rec.seq,
          length: chain.length,
          reason: `انقطاع السلسلة عند seq=${rec.seq}: prevHash لا يطابق الحلقة السابقة.`,
        };
      }
      const { hash, ...rest } = rec;
      const recomputed = hashRecord(rest);
      if (recomputed !== hash) {
        return {
          valid: false,
          brokenAt: rec.seq,
          length: chain.length,
          reason: `تلاعب مكتشَف عند seq=${rec.seq}: التجزئة المُعاد حسابها لا تطابق المسجَّلة.`,
        };
      }
    }
    return {
      valid: true,
      brokenAt: null,
      length: chain.length,
      reason: "السلسلة سليمة — لا تلاعب.",
    };
  }

  /** Test helper — clears the chain. */
  reset(): void {
    this.chain = [];
  }
}

/** Shared singleton used by the tRPC surface (api/authority-router.ts). */
export const authorityGate = new AuthorityGate();
