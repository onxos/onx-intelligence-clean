// ============================================================
// AUTH HARDENING — Day 4: Foundation Skill 2
// RBAC v2: Enhanced role-based access control
// Integrates with existing auth + adds security layers
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { ROLES, roleHasPermission, type Permission } from "./lib/rbac";
const rateLimits: Map<string, { count: number; resetAt: number }> = new Map();
const tokenUsage: Map<string, { tokens: number; resetAt: number }> = new Map();

function checkRateLimit(userId: string, maxRpm: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = rateLimits.get(userId);
  const windowMs = 60000; // 1 minute

  if (!record || now > record.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRpm - 1, resetAt: now + windowMs };
  }

  if (record.count >= maxRpm) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count++;
  return { allowed: true, remaining: maxRpm - record.count, resetAt: record.resetAt };
}

function checkTokenLimit(userId: string, tokens: number, maxDaily: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const dayMs = 86400000;
  const record = tokenUsage.get(userId);

  if (!record || now > record.resetAt) {
    tokenUsage.set(userId, { tokens, resetAt: now + dayMs });
    return { allowed: tokens <= maxDaily, remaining: maxDaily - tokens };
  }

  const newTotal = record.tokens + tokens;
  if (newTotal > maxDaily) {
    return { allowed: false, remaining: maxDaily - record.tokens };
  }

  record.tokens = newTotal;
  return { allowed: true, remaining: maxDaily - newTotal };
}

// --- Permission Checker (delegates to shared RBAC model) ---
const hasPermission = (roleId: string, permission: Permission): boolean =>
  roleHasPermission(roleId, permission);

// --- Audit Log ---
const auditLog: Array<{
  timestamp: string;
  userId: string;
  action: string;
  permission: string;
  allowed: boolean;
  reason: string;
}> = [];

function audit(userId: string, action: string, permission: string, allowed: boolean, reason: string) {
  auditLog.push({ timestamp: new Date().toISOString(), userId, action, permission, allowed, reason });
  if (auditLog.length > 10000) auditLog.splice(0, auditLog.length - 10000);
}

export const authHardeningRouter = createRouter({
  // AH-01: checkPermission — Verify if role has permission
  checkPermission: publicQuery
    .input(z.object({
      role: z.enum(["guest", "user", "operator", "admin", "founder"]),
      permission: z.string(),
    }))
    .query(({ input }) => {
      const allowed = hasPermission(input.role, input.permission as Permission);
      audit("system", "CHECK_PERMISSION", input.permission, allowed, allowed ? "Role has permission" : "Permission denied");
      return { role: input.role, permission: input.permission, allowed };
    }),

  // AH-02: getRole — Get role details
  getRole: publicQuery
    .input(z.object({ role: z.enum(["guest", "user", "operator", "admin", "founder"]) }))
    .query(({ input }) => {
      const role = ROLES[input.role];
      return {
        id: role.id,
        nameAr: role.nameAr,
        nameEn: role.nameEn,
        level: role.level,
        permissions: role.permissions,
        limits: {
          maxRequestsPerMinute: role.maxRequestsPerMinute,
          maxTokensPerDay: role.maxTokensPerDay,
        },
      };
    }),

  // AH-03: listRoles — All roles
  listRoles: publicQuery.query(() =>
    Object.values(ROLES).map((r) => ({
      id: r.id,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      level: r.level,
      permissionCount: r.permissions.length,
    }))
  ),

  // AH-04: checkRateLimit — Rate limit check
  checkRateLimit: publicQuery
    .input(z.object({
      userId: z.string(),
      role: z.enum(["guest", "user", "operator", "admin", "founder"]),
    }))
    .query(({ input }) => {
      const role = ROLES[input.role];
      const result = checkRateLimit(input.userId, role.maxRequestsPerMinute);
      audit(input.userId, "RATE_LIMIT_CHECK", "system", result.allowed, result.allowed ? "Within limit" : "Rate limit exceeded");
      return { ...result, maxRpm: role.maxRequestsPerMinute };
    }),

  // AH-05: checkTokenLimit — Token usage check
  checkTokenLimit: publicQuery
    .input(z.object({
      userId: z.string(),
      role: z.enum(["guest", "user", "operator", "admin", "founder"]),
      requestedTokens: z.number().min(1),
    }))
    .query(({ input }) => {
      const role = ROLES[input.role];
      const result = checkTokenLimit(input.userId, input.requestedTokens, role.maxTokensPerDay);
      return { ...result, maxDaily: role.maxTokensPerDay };
    }),

  // AH-06: canAccess — Combined access check (permission + rate + token)
  canAccess: publicQuery
    .input(z.object({
      userId: z.string(),
      role: z.enum(["guest", "user", "operator", "admin", "founder"]),
      permission: z.string(),
      estimatedTokens: z.number().optional(),
    }))
    .query(({ input }) => {
      const role = ROLES[input.role];
      const checks: Array<{ name: string; passed: boolean; details: string }> = [];

      // Permission check
      const permAllowed = hasPermission(input.role, input.permission as Permission);
      checks.push({
        name: "PERMISSION",
        passed: permAllowed,
        details: permAllowed ? `${input.role} has ${input.permission}` : `${input.role} lacks ${input.permission}`,
      });

      // Rate limit check
      const rateResult = checkRateLimit(input.userId, role.maxRequestsPerMinute);
      checks.push({
        name: "RATE_LIMIT",
        passed: rateResult.allowed,
        details: `Remaining: ${rateResult.remaining}/${role.maxRequestsPerMinute}`,
      });

      // Token limit check
      let tokenResult = { allowed: true, remaining: role.maxTokensPerDay };
      if (input.estimatedTokens) {
        tokenResult = checkTokenLimit(input.userId, input.estimatedTokens, role.maxTokensPerDay);
        checks.push({
          name: "TOKEN_LIMIT",
          passed: tokenResult.allowed,
          details: `Remaining: ${tokenResult.remaining}/${role.maxTokensPerDay}`,
        });
      }

      const allPassed = checks.every((c) => c.passed);
      audit(input.userId, "ACCESS_CHECK", input.permission, allPassed, allPassed ? "All checks passed" : "Access denied");

      return {
        userId: input.userId,
        role: input.role,
        permission: input.permission,
        allowed: allPassed,
        checks,
        reason: allPassed ? "Access granted" : `Failed: ${checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`,
      };
    }),

  // AH-07: auditLog — Security audit trail
  auditLog: publicQuery
    .input(z.object({
      limit: z.number().default(50),
      userId: z.string().optional(),
    }))
    .query(({ input }) => {
      let entries = [...auditLog].reverse();
      if (input.userId) {
        entries = entries.filter((e) => e.userId === input.userId);
      }
      return {
        entries: entries.slice(0, input.limit),
        total: auditLog.length,
      };
    }),

  // AH-08: stats — Security statistics
  stats: publicQuery.query(() => ({
    totalAuditEntries: auditLog.length,
    allowedCount: auditLog.filter((e) => e.allowed).length,
    deniedCount: auditLog.filter((e) => !e.allowed).length,
    roleDistribution: Object.fromEntries(
      Object.keys(ROLES).map((r) => [r, auditLog.filter((e) => e.userId.startsWith(r) || e.userId === "system").length])
    ),
    activeRateLimits: rateLimits.size,
    activeTokenTrackers: tokenUsage.size,
  })),
});
