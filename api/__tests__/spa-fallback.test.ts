// ============================================================
// SPA FALLBACK — UNIT TESTS (Wave 11-b "Mind pulse")
// serveStaticFiles (api/lib/vite.ts) must serve index.html for any
// GET/HEAD miss that is neither an /api route nor an asset-like path
// (file extension) — REGARDLESS of the Accept header, so deep links
// like /titan-conclave/pulse resolve for every client. /api misses
// and asset misses keep their JSON 404 (boot.ts additionally guards
// /api/* upstream, before static serving — mirrored here).
// ============================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";

const FAKE_INDEX =
  '<!doctype html><html><head><title>ONX</title></head><body><div id="root"></div></body></html>';

const fsState = vi.hoisted(() => ({ failIndexRead: false }));

// Intercept ONLY the dist/public/index.html read; everything else stays real.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const readFileSync = ((p: unknown, ...rest: unknown[]) => {
    if (String(p).replace(/\\/g, "/").endsWith("dist/public/index.html")) {
      if (fsState.failIndexRead) throw new Error("ENOENT: dist not built");
      return FAKE_INDEX;
    }
    return (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof actual.readFileSync;
  return { ...actual, readFileSync, default: { ...actual, readFileSync } };
});

import { serveStaticFiles } from "../lib/vite";

/** App with ONLY the static/fallback layer (isolates the notFound handler). */
function fallbackApp() {
  const app = new Hono<{ Bindings: HttpBindings }>();
  serveStaticFiles(app);
  return app;
}

/** Mirrors the production tail of boot.ts: /api/* JSON 404 BEFORE static. */
function prodLikeApp() {
  const app = new Hono<{ Bindings: HttpBindings }>();
  app.all("/api/*", (c) => c.json({ error: "Not Found", path: c.req.path }, 404));
  serveStaticFiles(app);
  return app;
}

beforeEach(() => {
  fsState.failIndexRead = false;
});

describe("SPA fallback — deep links resolve to index.html", () => {
  it("GET /titan-conclave/pulse WITHOUT any Accept header → 200 HTML", async () => {
    const res = await fallbackApp().request("/titan-conclave/pulse");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('<div id="root">');
  });

  it("GET /titan-conclave/pulse with Accept: text/html → 200 HTML", async () => {
    const res = await fallbackApp().request("/titan-conclave/pulse", {
      headers: { accept: "text/html,application/xhtml+xml" },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  it("GET with Accept: application/json (headless probe) → still 200 HTML (the old 404 bug)", async () => {
    const res = await fallbackApp().request("/titan-conclave/pulse", {
      headers: { accept: "application/json" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("serves nested SPA paths too", async () => {
    const res = await fallbackApp().request("/some/deep/spa/path");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  it("HEAD requests are served as the SPA shell (200)", async () => {
    const res = await fallbackApp().request("/titan-conclave/pulse", { method: "HEAD" });

    expect(res.status).toBe(200);
  });
});

describe("SPA fallback — API namespace stays JSON", () => {
  it("production order: /api/trpc/* is answered as JSON BEFORE static serving", async () => {
    const res = await prodLikeApp().request("/api/trpc/health.reflection", {
      headers: { accept: "text/html" },
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ error: "Not Found" });
  });

  it("even without the upstream guard, the notFound handler keeps /api/* JSON", async () => {
    const res = await fallbackApp().request("/api/unknown-route", {
      headers: { accept: "text/html" },
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Not Found" });
  });

  it("bare /api is JSON too", async () => {
    const res = await fallbackApp().request("/api");

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Not Found" });
  });
});

describe("SPA fallback — non-page misses keep their 404", () => {
  it("missing asset-like paths (file extension) → JSON 404, not index.html", async () => {
    const res = await fallbackApp().request("/assets/missing-chunk.js");

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Not Found" });
  });

  it("non-GET methods never receive the SPA shell", async () => {
    const res = await fallbackApp().request("/titan-conclave/pulse", { method: "POST" });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Not Found" });
  });

  it("if index.html cannot be read (dist not built) the request still gets a clean 404", async () => {
    fsState.failIndexRead = true;

    const res = await fallbackApp().request("/titan-conclave/pulse");

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Not Found" });
  });
});
