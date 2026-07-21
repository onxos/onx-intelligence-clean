// ============================================================
// RBAC ENFORCEMENT — e2e / integration tests (M-11)
// Proves protected routes actually reject unauthorized access,
// rather than only *reporting* permission state.
// ============================================================
import { describe, it, expect } from "vitest";
import { createRouter, permissionProcedure } from "../middleware";
import { appRouter } from "../router";
import { roleHasPermission } from "../lib/rbac";
import type { TrpcContext } from "../context";

// Minimal isolated router exercising the enforcing guard without touching
// any datastore, so both allow and deny paths are deterministic.
const guardedRouter = createRouter({
  secret: permissionProcedure("runtime:admin").query(() => "granted"),
});

function ctxWithRole(role: string): TrpcContext {
  return {
    req: new Request("http://localhost/api/trpc/guarded.secret"),
    resHeaders: new Headers(),
    user: { unionId: `u-${role}`, role } as TrpcContext["user"],
  };
}

function anonymousCtx(url = "http://localhost/"): TrpcContext {
  return { req: new Request(url), resHeaders: new Headers() };
}

describe("RBAC enforcement — permissionProcedure", () => {
  it("rejects an authenticated user lacking the permission (FORBIDDEN)", async () => {
    const caller = guardedRouter.createCaller(ctxWithRole("user"));
    await expect(caller.secret()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    const caller = guardedRouter.createCaller(anonymousCtx());
    await expect(caller.secret()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows a principal whose role holds the permission", async () => {
    const caller = guardedRouter.createCaller(ctxWithRole("admin"));
    await expect(caller.secret()).resolves.toBe("granted");
  });
});

describe("RBAC enforcement — sensitive provider-keys route", () => {
  it("denies a plain user from writing provider secrets", async () => {
    const caller = appRouter.createCaller(ctxWithRole("user"));
    await expect(
      caller.providerKeys.set({ provider: "openai", keyValue: "sk-test-xxxx", label: "t" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies an anonymous caller (no user, no bridge key) from writing secrets", async () => {
    const caller = appRouter.createCaller(anonymousCtx());
    await expect(
      caller.providerKeys.remove({ provider: "openai" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("RBAC model — shared table", () => {
  it("is deny-by-default for unknown roles", () => {
    expect(roleHasPermission("nope", "runtime:admin")).toBe(false);
    expect(roleHasPermission(undefined, "runtime:admin")).toBe(false);
  });

  it("grants admin runtime:admin but denies plain user", () => {
    expect(roleHasPermission("admin", "runtime:admin")).toBe(true);
    expect(roleHasPermission("user", "runtime:admin")).toBe(false);
  });
});
