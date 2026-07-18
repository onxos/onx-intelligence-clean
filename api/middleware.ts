import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { Guardian, USFIPv2Engine } from "@onx/intelligence-runtime";
import { env } from "./lib/env";
import { recordGovernanceDecision } from "./lib/governance-log-store";

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

  // Run USFIP v2 audit
  const audit = usfip.fullAudit({
    path,
    userId: ctx.user?.unionId ?? "anonymous",
    role: ctx.user?.role ?? "user",
    timestamp: new Date().toISOString(),
  });

  // Guardian Amanah check
  const amanahResult = guardian.checkAmanah(audit.score);

  // Log governance decision (non-blocking — best effort)
  recordGovernanceDecision({
    auditId: `gov-${Date.now()}`,
    path,
    userId: ctx.user?.unionId ?? "anonymous",
    role: ctx.user?.role ?? "user",
    amanahScore: audit.score,
    passed: amanahResult.passed,
    level: amanahResult.passed ? "GREEN" : "RED",
    shadowTrusted: true,
  });
  if (!amanahResult.passed) {
    process.stderr.write(
      `[Guardian] BLOCKED ${path} — Amanah: ${audit.score} < 0.5 (user: ${ctx.user?.unionId ?? "anon"})\n`
    );
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Constitutional violation: Amanah score ${audit.score} below required threshold (0.5). Principle: ${amanahResult.message}`,
    });
  }

  // Shadow validation
  const shadowResult = guardian.validateShadow(
    ctx.user ? "L1_VERIFIED" : "L8_GENERAL"
  );

  if (!shadowResult.trusted) {
    process.stderr.write(`[Guardian] SHADOW WARNING: ${path} — ${shadowResult.message}\n`);
  }

  return next({
    ctx: {
      ...ctx,
      constitutional: {
        amanahScore: audit.score,
        passed: amanahResult.passed,
        shadowValidated: shadowResult.trusted,
        auditId: `gov-${Date.now()}`,
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
