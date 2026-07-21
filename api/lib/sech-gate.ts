// ============================================================
// SECH GATE — Sovereign Ethical Constitutional Hardgate (C-1)
// ============================================================
// Replaces the implicit "auto-approve" behaviour of the governance
// path with an explicit, fail-closed decision engine.
//
// Design principle: DENY BY DEFAULT. A request is only ALLOWED when
// it positively satisfies every constitutional constraint. Anything
// that is missing, malformed, below the Amanah floor, or otherwise
// unproven is DENIED (or ESCALATED for privileged review) — never
// silently approved. Every decision carries a machine-readable reason
// so the outcome is accountable and queryable.
//
// This module is pure and synchronous so it is trivially unit-testable
// and safe to call on the hot request path. Persistence of the emitted
// decision is handled by the caller (governance-log-store).
// ============================================================

/** Constitutional Amanah floor — mirrors USFIPv2Engine / Guardian. */
export const AMANAH_FLOOR = 0.5;

/** Score at/above which an otherwise-authorized principal is trusted
 *  without additional human escalation. Between the floor and this band
 *  the request is escalated rather than auto-approved. */
export const ESCALATION_CEILING = 0.75;

export type SechDecision = "ALLOW" | "ESCALATE" | "DENY";

export interface SechRequest {
  /** tRPC path / operation being gated. */
  path: string;
  /** Stable principal id; empty/undefined => anonymous. */
  userId?: string;
  /** Principal role; empty/undefined => untrusted. */
  role?: string;
  /** Amanah/constitutional audit score in [0,1]. `undefined`/NaN means
   *  the audit could not be computed — treated as fail-closed. */
  amanahScore?: number;
  /** Whether the shadow/provenance check trusted the origin. */
  shadowTrusted?: boolean;
  /** True when the caller authenticated as a machine over the bridge. */
  bridgeMachine?: boolean;
}

export interface SechResult {
  decision: SechDecision;
  /** True only when decision === "ALLOW". Convenience for guards. */
  allowed: boolean;
  /** Stable machine code for the reason (also used in logs/tests). */
  reasonCode: string;
  /** Human-readable explanation of the decision. */
  reason: string;
  /** Normalised score actually used for the decision. */
  amanahScore: number;
  level: "GREEN" | "AMBER" | "RED";
}

function fail(
  path: string,
  reasonCode: string,
  reason: string,
  score: number,
): SechResult {
  return {
    decision: "DENY",
    allowed: false,
    reasonCode,
    reason: `[${path}] ${reason}`,
    amanahScore: score,
    level: "RED",
  };
}

/**
 * Evaluate a request against the constitution. Deny-by-default:
 * the function only returns ALLOW when every gate is positively met.
 */
export function evaluateSech(req: SechRequest): SechResult {
  const path = req.path || "<unknown>";

  // Gate 1 — Identity. No anonymous access to gated surfaces. A verified
  // bridge machine is an accepted server-to-server identity.
  const hasIdentity =
    req.bridgeMachine === true ||
    (typeof req.userId === "string" && req.userId.trim().length > 0 &&
      req.userId !== "anonymous");
  if (!hasIdentity) {
    return fail(path, "NO_IDENTITY", "denied: no authenticated principal (deny-by-default)", 0);
  }

  // Gate 2 — Audit integrity. A missing/NaN score means the audit engine
  // could not vouch for the request. Fail closed rather than assume good.
  const rawScore = req.amanahScore;
  if (typeof rawScore !== "number" || Number.isNaN(rawScore)) {
    return fail(path, "NO_AUDIT", "denied: constitutional audit unavailable (fail-closed)", 0);
  }
  const score = Math.max(0, Math.min(1, rawScore));

  // Gate 3 — Amanah floor. Below the constitutional floor is always denied.
  if (score < AMANAH_FLOOR) {
    return fail(
      path,
      "BELOW_AMANAH_FLOOR",
      `denied: Amanah score ${score.toFixed(2)} below floor ${AMANAH_FLOOR}`,
      score,
    );
  }

  // Bridge machines that clear the floor are trusted (server-to-server,
  // already authenticated by shared secret).
  if (req.bridgeMachine === true) {
    return {
      decision: "ALLOW",
      allowed: true,
      reasonCode: "BRIDGE_TRUSTED",
      reason: `[${path}] allowed: verified bridge machine above Amanah floor`,
      amanahScore: score,
      level: "GREEN",
    };
  }

  // Gate 4 — Escalation band. A human principal between the floor and the
  // escalation ceiling, or one whose provenance is untrusted, is NOT
  // auto-approved: it is escalated for privileged review. ESCALATE is a
  // non-allow outcome (the guard blocks) but distinct from a hard DENY.
  if (score < ESCALATION_CEILING || req.shadowTrusted === false) {
    return {
      decision: "ESCALATE",
      allowed: false,
      reasonCode: req.shadowTrusted === false ? "UNVERIFIED_SHADOW" : "SUB_CEILING",
      reason:
        `[${path}] escalated: score ${score.toFixed(2)} in review band ` +
        `[${AMANAH_FLOOR}, ${ESCALATION_CEILING}) or unverified provenance`,
      amanahScore: score,
      level: "AMBER",
    };
  }

  // All gates positively satisfied.
  return {
    decision: "ALLOW",
    allowed: true,
    reasonCode: "OK",
    reason: `[${path}] allowed: all constitutional gates satisfied`,
    amanahScore: score,
    level: "GREEN",
  };
}
