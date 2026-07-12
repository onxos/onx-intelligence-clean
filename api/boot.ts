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
import { computeIUC, type IurgObjectInput } from "./iuc-engine";
import { createLoop, tickLoop, type Rung } from "./living-loop";
import {
  appendContinuityLog,
  getIurgObjects,
  saveIucSnapshot,
  saveIurgObject,
} from "./lib/iurg-store";
import { markIucTick, setIucCronStatus } from "./lib/iuc-runtime";
import { runPerceptionSyncTick } from "./lib/perception-adapter";
import { runReflectionTick } from "./lib/reflection-cycle";
import { runMindTick } from "./lib/mind-tick";
import { hydratePersistedIurgGraph } from "./iuc-router";

const app = new Hono<{ Bindings: HttpBindings }>();

function toRung(rank?: number): Rung {
  const r = Math.max(1, Math.min(6, Math.trunc(rank ?? 1)));
  return (`R${r}` as Rung);
}

function fromRung(rung: Rung): 1 | 2 | 3 | 4 | 5 | 6 {
  return Number(rung.substring(1)) as 1 | 2 | 3 | 4 | 5 | 6;
}

function shouldSnapshot(now: Date): boolean {
  return now.getUTCMinutes() === 0;
}

async function runLivingLoopTick(): Promise<void> {
  const objects = await getIurgObjects();
  if (objects.length === 0) return;

  const loop = createLoop(objects.map((obj) => ({
    id: obj.id ?? "",
    rung: toRung(obj.rank),
    strength: obj.context ?? obj.trust ?? 0.5,
    decayRate: 0.02,
    reinforceRate: 0.03,
  })));
  tickLoop(loop);

  for (const event of loop.log) {
    await appendContinuityLog({
      tick: event.tick,
      eventType: event.type,
      objectId: event.objectId,
      detail: event.detail,
    });
  }

  const byId = new Map(objects.map((obj) => [obj.id, obj] as const));
  for (const item of loop.objects) {
    const source = byId.get(item.id);
    if (!source) continue;
    await saveIurgObject({
      ...source,
      rank: fromRung(item.rung),
      context: item.strength,
    });
  }

  if (shouldSnapshot(new Date())) {
    const persisted = await getIurgObjects();
    const snapshot = computeIUC(persisted as IurgObjectInput[]);
    const value = (key: string): number => snapshot.indicators.find((i) => i.key === key)?.value ?? 0;
    await saveIucSnapshot({
      tuc: snapshot.tuc,
      ugr: value("UGR"),
      urs: value("URS"),
      ksr: value("UC"),
      pdr: value("UY"),
      krr: value("UVR"),
      kor: value("UT"),
      scg: value("CAS"),
      sai: value("FAS"),
      objectCount: snapshot.objectCount,
    });
  }
}

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
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
      // G6: living mind cycle — inbox → B5 contradictions → B7 proposals.
      // runMindTick never throws by design; guarded anyway.
      try {
        await runMindTick();
      } catch (err) {
        console.error("[mind-tick] tick failed (non-fatal):", err);
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
