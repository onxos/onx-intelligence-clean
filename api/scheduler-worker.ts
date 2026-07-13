// ============================================================
// SCHEDULER WORKER — standalone runtime-loop scheduler process
// render.yaml declares `onx-scheduler` with:
//   startCommand: node dist/scheduler-worker.js
// Before this file existed the worker had no entrypoint and the
// blueprint's worker service could never boot (STE-01 deploy gap).
//
// Runs the exact same production cycle as api/boot.ts:
//   hydrate IURG → perception sync → reflection, then every 5
//   minutes: living-loop tick → perception → reflection.
// No HTTP server — pure background worker.
//
// NOTE: if deployed alongside the web service (which runs its own
// internal cron), the loop ticks twice per interval. The worker is
// declared `autoDeploy: false` in render.yaml — enable it only when
// the web-internal cron is retired or intentionally doubled.
// ============================================================
import { Cron } from "croner";
import { runLivingLoopTick } from "./lib/runtime-loop-tick";
import { markIucTick, setIucCronStatus } from "./lib/iuc-runtime";
import { runPerceptionSyncTick } from "./lib/perception-adapter";
import { runReflectionTick } from "./lib/reflection-cycle";
import { hydratePersistedIurgGraph } from "./iuc-router";

process.stderr.write(
  `[scheduler-worker] NODE_ENV=${process.env.NODE_ENV} starting runtime-loop scheduler...\n`,
);

// Same survival policy as boot.ts: one bad tick must never kill the worker.
process.on("unhandledRejection", (reason) => {
  console.error("[scheduler-worker] unhandledRejection (survived):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[scheduler-worker] uncaughtException (survived):", err);
});

setIucCronStatus("active");

const job = new Cron("*/5 * * * *", async () => {
  try {
    await runLivingLoopTick();
    markIucTick();
  } catch (err) {
    console.error("[scheduler-worker] living-loop tick failed (non-fatal):", err);
  }
  try {
    await runPerceptionSyncTick();
  } catch (err) {
    console.error("[scheduler-worker] perception tick failed (non-fatal):", err);
  }
  try {
    await runReflectionTick();
  } catch (err) {
    console.error("[scheduler-worker] reflection tick failed (non-fatal):", err);
  }
});

hydratePersistedIurgGraph()
  .then(({ loaded }) => {
    process.stderr.write(
      `[scheduler-worker] IURG hydration loaded ${loaded} persisted objects\n`,
    );
    return runPerceptionSyncTick();
  })
  .then(() => runReflectionTick())
  .catch((err) => {
    console.error("[scheduler-worker] boot sync failed (non-fatal):", err);
  });

process.stderr.write(
  `[scheduler-worker] Running. Next tick: ${job.nextRun()?.toISOString() ?? "unscheduled"}\n`,
);
