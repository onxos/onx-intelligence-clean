import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Cron } from "croner";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { serveStaticFiles } from "./lib/vite";
import { runLivingLoopTick } from "./lib/runtime-loop-tick";
import { markIucTick, setIucCronStatus } from "./lib/iuc-runtime";
import { runPerceptionSyncTick } from "./lib/perception-adapter";
import { runReflectionTick } from "./lib/reflection-cycle";
import { hydratePersistedIurgGraph } from "./iuc-router";

const app = new Hono<{ Bindings: HttpBindings }>();

const BOOT_TIME = new Date().toISOString();

// Deployment-proof source of truth: Render injects RENDER_GIT_COMMIT;
// generic hosts can set COMMIT_SHA / GIT_SHA. Never a secret.
function deployedCommit(): string {
  return (
    process.env.RENDER_GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    process.env.GIT_SHA ||
    "unknown"
  );
}

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// STE-01 production-proof endpoints (plain HTTP, no tRPC client needed).
// Deep component checks remain at /api/trpc/health.* (health-router.ts).
app.get("/health", (c) =>
  c.json({
    status: "ALIVE",
    uptime: process.uptime(),
    bootTime: BOOT_TIME,
    commit: deployedCommit(),
    env: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  }),
);
app.get("/commit", (c) =>
  c.json({
    commit: deployedCommit(),
    service: "onx-intelligence-clean",
    bootTime: BOOT_TIME,
    timestamp: new Date().toISOString(),
  }),
);
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

process.stderr.write(`[boot] NODE_ENV=${process.env.NODE_ENV} isProduction=${env.isProduction} PORT=${process.env.PORT}\n`);

if (env.isProduction) {
  // Safety net: a single unhandled rejection must never kill the service.
  // (The living-loop cron used to crash the whole process every 5 minutes
  // when the dead mysql2 layer timed out against the Postgres DATABASE_URL.)
  process.on("unhandledRejection", (reason) => {
    console.error("[boot] unhandledRejection (survived):", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[boot] uncaughtException (survived):", err);
  });
  try {
    setIucCronStatus("active");
    new Cron("*/5 * * * *", async () => {
      try {
        await runLivingLoopTick();
        markIucTick();
      } catch (err) {
        console.error("[living-loop] tick failed (non-fatal):", err);
      }
      // Wave 5-b: feed inbox events into the IUC graph as PERCEPTIONs.
      // runPerceptionSyncTick never throws by design; guarded anyway.
      try {
        await runPerceptionSyncTick();
      } catch (err) {
        console.error("[perception-adapter] tick failed (non-fatal):", err);
      }
      // Wave 7-c: derive INSIGHTs from accumulated PERCEPTIONs.
      // runReflectionTick never throws by design; guarded anyway.
      try {
        await runReflectionTick();
      } catch (err) {
        console.error("[reflection-cycle] tick failed (non-fatal):", err);
      }
    });
    // Wave 6-b boot order: (1) hydrate persisted IURG objects from
    // Postgres into the in-memory graph, THEN (2) replay the inbox via
    // the perception adapter — its perc-* ingests upsert by id over the
    // hydrated nodes, so the sequence is idempotent and chain-safe.
    // Both steps are non-fatal by design.
    hydratePersistedIurgGraph()
      .then(({ loaded }) => {
        process.stderr.write(`[boot] IURG hydration loaded ${loaded} persisted objects\n`);
        return runPerceptionSyncTick();
      })
      // Wave 7-c: reflect once at boot over the freshly replayed perceptions.
      .then(() => runReflectionTick())
      .catch((err) => {
        console.error("[boot] hydration/perception boot sync failed (non-fatal):", err);
      });
    serveStaticFiles(app);
    const port = parseInt(process.env.PORT || "3000");
    process.stderr.write(`[boot] Starting server on port ${port}...\n`);
    serve({ fetch: app.fetch, port }, () => {
      process.stderr.write(`[boot] Server listening on http://localhost:${port}/\n`);
      console.log(`Server running on http://localhost:${port}/`);
    });
  } catch (err) {
    process.stderr.write(`[boot] FATAL: ${err}\n`);
    process.exit(1);
  }
} else {
  setIucCronStatus("paused");
}
