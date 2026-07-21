import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { Guardian, USFIPv2Engine } from "@onx/intelligence-runtime";
import { env } from "./lib/env";
import { recordGovernanceDecision } from "./lib/governance-log-store";
import { evaluateSech } from "./lib/sech-gate";
import { roleHasPermission, type Permission } from "./lib/rbac";

// Shared runtime instances
export const guardian = new Guardian();
export const usfip = new USFIPv2Engine({ amanahFloor: 0.5, enforce: true });

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

// ============================================================
// CONSTITUTIONAL GUARDIAN MIDDLEWARE
// Enforces 7 ONX principles on every protected procedure
// ============================================================
const constitutionalCheck = t.middleware(async (opts) => {
  const { ctx, next, path } = opts;

  // Run USFIP v2 audit to obtain the constitutional score.
  const audit = usfip.fullAudit({
    path,
    userId: ctx.user?.unionId ?? "anonymous",
    role: ctx.user?.role ?? "user",
    timestamp: new Date().toISOString(),
  });

  // Shadow / provenance validation feeds the gate.
  const shadowResult = guardian.validateShadow(
    ctx.user ? "L1_VERIFIED" : "L8_GENERAL"
  );

  // C-1: fail-closed SECH gate. DENY-BY-DEFAULT — a request is only
  // allowed when it positively clears every constitutional gate. Missing
  // identity, an uncomputable audit, a sub-floor score, or unverified
  // provenance are refused/escalated (never silently approved), and the
  // machine-readable reason is persisted for accountability.
  const auditId = `gov-${Date.now()}`;
  const verdict = evaluateSech({
    path,
    userId: ctx.user?.unionId,
    role: ctx.user?.role,
    amanahScore: audit.score,
    shadowTrusted: shadowResult.trusted,
  });

  // Log governance decision (non-blocking — best effort).
  recordGovernanceDecision({
    auditId,
    path,
    userId: ctx.user?.unionId ?? "anonymous",
    role: ctx.user?.role ?? "user",
    amanahScore: verdict.amanahScore,
    passed: verdict.allowed,
    level: verdict.level,
    shadowTrusted: shadowResult.trusted,
  });

  if (!verdict.allowed) {
    process.stderr.write(
      `[SECH] ${verdict.decision} ${path} — ${verdict.reasonCode}: ${verdict.reason} ` +
        `(user: ${ctx.user?.unionId ?? "anon"})\n`
    );
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        `Constitutional gate ${verdict.decision} (${verdict.reasonCode}): ${verdict.reason}`,
    });
  }

  return next({
    ctx: {
      ...ctx,
      constitutional: {
        amanahScore: verdict.amanahScore,
        passed: verdict.allowed,
        decision: verdict.decision,
        reasonCode: verdict.reasonCode,
        shadowValidated: shadowResult.trusted,
        auditId,
      },
    },
  });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
// Protected + Constitutional — all sensitive procedures use this
export const constitutionalProcedure = authedQuery.use(constitutionalCheck);

// ============================================================
// RBAC ENFORCEMENT (M-11)
// Binds the shared role/permission model to the request path. Unlike
// the reporting-only auth-hardening router, this middleware actually
// blocks: an authenticated principal whose role lacks the required
// permission is rejected with FORBIDDEN (deny-by-default).
// ============================================================
function requirePermission(permission: Permission) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: ErrorMessages.unauthenticated,
      });
    }
    if (!roleHasPermission(ctx.user.role, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `${ErrorMessages.insufficientRole} (missing permission: ${permission})`,
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Build an authenticated procedure that enforces a specific permission. */
export function permissionProcedure(permission: Permission) {
  return authedQuery.use(requirePermission(permission));
}



// ============================================================
// PROTECTED DOMAIN GUARD (EV-SEC-01)
// Operational domain surfaces accept a user session OR the bridge
// shared secret (server-to-server). No anonymous operational access.
// ============================================================
const requireUserOrBridge = t.middleware(async (opts) => {
  const { ctx, next, path } = opts;
  // Governance observability: every protected call leaves a queryable
  // constitutional audit trail (non-blocking; never throws here — blocking
  // enforcement lives in constitutionalProcedure).
  recordGovernanceDecision({
    auditId: `gov-${Date.now()}`,
    path,
    userId: ctx.user?.unionId ?? "bridge-machine",
    role: ctx.user?.role ?? "system",
    amanahScore: 1,
    passed: true,
    level: "GREEN",
    shadowTrusted: true,
  });
  if (ctx.user) {
    return next({ ctx: { ...ctx, user: ctx.user } });
  }
  const key = ctx.req.headers.get("x-onx-bridge-key");
  if (env.bridgeSharedSecret && key && key === env.bridgeSharedSecret) {
    return next({ ctx: { ...ctx, bridgeMachine: true as const } });
  }
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: ErrorMessages.unauthenticated,
  });
});

export const protectedQuery = t.procedure.use(requireUserOrBridge);

// ============================================================
// PROTECTED + RBAC GUARD (M-11)
// Same server-to-server bridge acceptance as protectedQuery, but a
// *human* principal must additionally hold the required permission.
// Bridge machines (already authenticated by shared secret) bypass the
// per-user permission check; anonymous callers are always rejected.
// ============================================================
function requireUserPermissionOrBridge(permission: Permission) {
  return t.middleware(async (opts) => {
    const { ctx, next, path } = opts;
    if (ctx.user) {
      if (!roleHasPermission(ctx.user.role, permission)) {
        recordGovernanceDecision({
          auditId: `gov-${Date.now()}`,
          path,
          userId: ctx.user.unionId,
          role: ctx.user.role,
          amanahScore: 0,
          passed: false,
          level: "RED",
          shadowTrusted: true,
        });
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${ErrorMessages.insufficientRole} (missing permission: ${permission})`,
        });
      }
      return next({ ctx: { ...ctx, user: ctx.user } });
    }
    const key = ctx.req.headers.get("x-onx-bridge-key");
    if (env.bridgeSharedSecret && key && key === env.bridgeSharedSecret) {
      return next({ ctx: { ...ctx, bridgeMachine: true as const } });
    }
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  });
}

/** Protected (user-or-bridge) procedure that also enforces a permission for human users. */
export function protectedPermissionProcedure(permission: Permission) {
  return t.procedure.use(requireUserPermissionOrBridge(permission));
}
