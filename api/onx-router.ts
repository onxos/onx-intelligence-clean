// ============================================================
// ONX ROUTER — STE-V-01 unified self-verification endpoint.
// onx.selfVerify: public read (providers.status pattern) — the
// aggregated honest report, no secrets (keyPrefix only).
// ============================================================
import { createRouter, publicQuery } from "./middleware";
import { buildSelfVerification } from "./lib/self-verify";

export const onxRouter = createRouter({
  selfVerify: publicQuery.query(async () => buildSelfVerification()),
});
