// ============================================================
// MIND TICK ROUTER (G6) — tRPC surface
// Exposes the living-mind cycle: fail-closed counters (status),
// the latest cycle result with its authority-classified PROPOSALS
// (last), and an on-demand guarded cycle (tick). Read + propose
// only — this surface, like the module beneath it, has no
// execution path; the A1 ceiling and autoExecutable=false are
// enforced inside api/lib/mind-tick.ts / zero-input.ts (B7).
// ============================================================
import { createRouter, publicQuery } from "./middleware";
import {
  runMindTick,
  getMindTickStatus,
  getLastMindTickResult,
  listMindTickQuarantine,
} from "./lib/mind-tick";

export const mindTickRouter = createRouter({
  status: publicQuery.query(() => getMindTickStatus()),

  last: publicQuery.query(() => getLastMindTickResult()),

  // DLQ audit: durably-quarantined rows (reasons + correlation ids,
  // identity fields only — payload values never leave Postgres).
  quarantine: publicQuery.query(() => listMindTickQuarantine()),

  // runMindTick never throws by design — a pg failure is a counted skip.
  tick: publicQuery.mutation(() => runMindTick()),
});
