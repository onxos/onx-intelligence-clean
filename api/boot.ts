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
  try {
    setIucCronStatus("active");
    new Cron("*/5 * * * *", async () => {
      await runLivingLoopTick();
      markIucTick();
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
