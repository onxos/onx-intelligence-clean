// ============================================================
// LIVE SMOKE CLI — STE-K-08 "Truth proof on the real deploy"
//
// ⚠ NOT part of CI. This script requires the NETWORK and a LIVE
// environment (Render production). It is invoked manually:
//     npm run smoke:live
//
// Config (env):
//   BASE_URL     — target service (default: Render production URL)
//   EXPECTED_SHA — optional; assert /health commit matches (full or
//                  prefix). Leave unset to skip the SHA contract.
//
// PRODUCTION SAFETY: exactly one request per contract. We prove the
// rate-limit disclosure from headers/body of a SINGLE call — we never
// flood the live service to trigger a real 429.
//
// Exit code: 1 if ANY contract is breached, else 0.
// ============================================================
import { runSmoke, DEFAULT_BASE_URL, type FetchLike } from "../api/lib/smoke-contracts";

async function main() {
  const baseUrl = process.env.BASE_URL?.trim() || DEFAULT_BASE_URL;
  const expectedSha = process.env.EXPECTED_SHA?.trim() || null;

  // Node 18+/24 global fetch adapted to our minimal FetchLike shape.
  const fetchImpl: FetchLike = async (url, init) => {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.headers,
      body: init?.body,
    });
    return {
      status: res.status,
      json: () => res.json(),
      text: () => res.text(),
    };
  };

  const report = await runSmoke(baseUrl, { expectedSha, fetchImpl });

  console.log(JSON.stringify(report, null, 2));

  console.error(
    `[smoke:live] ${report.baseUrl} — ${report.passedCount}/${report.total} contracts passed` +
      (expectedSha ? ` (expectedSha=${expectedSha})` : ""),
  );
  for (const c of report.contracts) {
    console.error(`[smoke:live] ${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
  }

  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error("[smoke:live] harness error:", error);
  process.exit(1);
});
