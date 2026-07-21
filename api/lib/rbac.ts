// ============================================================
// RBAC — shared role/permission model (M-11)
// ============================================================
// Single source of truth for roles and permissions. Previously this
// lived inline in auth-hardening-router.ts and was only *reported* via
// public queries — never enforced on the request path. This module
// exports the model plus a pure `roleHasPermission` check so both the
// reporting router and the enforcing tRPC middleware share one table.
// ============================================================

export type Permission =
  | "intelligence:read" | "intelligence:write" | "intelligence:admin"
  | "runtime:read" | "runtime:execute" | "runtime:admin"
  | "titan:ask" | "titan:council" | "titan:admin"
  | "constitution:validate" | "constitution:admin"
  | "user:read" | "user:manage"
  | "system:admin" | "system:audit";

export interface RoleDef {
  id: string;
  nameAr: string;
  nameEn: string;
  permissions: Permission[];
  level: number; // Higher = more privileged
  maxRequestsPerMinute: number;
  maxTokensPerDay: number;
}

export const ROLES: Record<string, RoleDef> = {
  guest: {
    id: "guest",
    nameAr: "ضيف",
    nameEn: "Guest",
    permissions: ["intelligence:read"],
    level: 0,
    maxRequestsPerMinute: 10,
    maxTokensPerDay: 1000,
  },
  user: {
    id: "user",
    nameAr: "مستخدم",
    nameEn: "User",
    permissions: ["intelligence:read", "intelligence:write", "titan:ask", "constitution:validate"],
    level: 1,
    maxRequestsPerMinute: 30,
    maxTokensPerDay: 10000,
  },
  operator: {
    id: "operator",
    nameAr: "مشغل",
    nameEn: "Operator",
    permissions: [
      "intelligence:read", "intelligence:write", "intelligence:admin",
      "runtime:read", "runtime:execute",
      "titan:ask", "titan:council",
      "constitution:validate",
      "user:read",
    ],
    level: 2,
    maxRequestsPerMinute: 60,
    maxTokensPerDay: 50000,
  },
  admin: {
    id: "admin",
    nameAr: "مدير",
    nameEn: "Administrator",
    permissions: [
      "intelligence:read", "intelligence:write", "intelligence:admin",
      "runtime:read", "runtime:execute", "runtime:admin",
      "titan:ask", "titan:council", "titan:admin",
      "constitution:validate", "constitution:admin",
      "user:read", "user:manage",
      "system:audit",
    ],
    level: 3,
    maxRequestsPerMinute: 120,
    maxTokensPerDay: 200000,
  },
  founder: {
    id: "founder",
    nameAr: "المؤسس",
    nameEn: "Founder",
    permissions: [
      "intelligence:read", "intelligence:write", "intelligence:admin",
      "runtime:read", "runtime:execute", "runtime:admin",
      "titan:ask", "titan:council", "titan:admin",
      "constitution:validate", "constitution:admin",
      "user:read", "user:manage",
      "system:admin", "system:audit",
    ],
    level: 4,
    maxRequestsPerMinute: 1000,
    maxTokensPerDay: 1000000,
  },
};

/** Deny-by-default permission check: unknown role or missing grant => false. */
export function roleHasPermission(roleId: string | undefined, permission: Permission): boolean {
  if (!roleId) return false;
  const role = ROLES[roleId];
  if (!role) return false;
  return role.permissions.includes(permission);
}
