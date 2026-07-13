/**
 * Live smoke contract — verifies TRUTH DOCTRINE against a REAL deployment.
 * NOT part of CI: requires network + live environment (honest exclusion).
 * Usage: BASE_URL=https://onx-intelligence-clean.onrender.com EXPECT_COMMIT=<sha> npm run smoke:live
 *   (EXPECTED_SHA is accepted as an alias for EXPECT_COMMIT.)
 *
 * 9 contracts: health, honest self-verify, rate-limit disclosure, ask.onx
 * honest refusal, ask.onx cited answer, bridge fail-closed, corpus manifest
 * truth (deployed corpus content sha256 == committed corpus-manifest.json),
 * truth-ledger read (onx.truthHistory — empty is honest when no live
 * scheduled capture), no key leak. The corpus manifest contract injects the
 * committed file so the pure evaluator does no fs I/O.
 */
// ============================================================
// Config (env):
//   BASE_URL      — target service (default: Render production URL)
//   EXPECT_COMMIT — optional; assert /health commit matches (full or
//                   prefix). Leave unset to skip the SHA contract.
//                   EXPECTED_SHA is accepted as an alias.
//
// PRODUCTION SAFETY: exactly one request per contract. We prove the
// rate-limit disclosure from a SINGLE call — we never flood the live
// service to trigger a real 429.
//
// Exit code: 1 if ANY contract is breached, else 0.
// ============================================================
import { runSmoke, DEFAULT_BASE_URL, type FetchLike, type CorpusManifestContract } from "../api/lib/smoke-contracts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const baseUrl = process.env.BASE_URL?.trim() || DEFAULT_BASE_URL;
  // Accept both names: EXPECT_COMMIT (canonical) and EXPECTED_SHA (alias).
  const expectedSha =
    process.env.EXPECT_COMMIT?.trim() || process.env.EXPECTED_SHA?.trim() || null;

  // Inject the committed corpus contract (fs read stays OUT of the pure
  // contract logic — the evaluator receives the parsed object).
  let committedManifest: CorpusManifestContract | null = null;
  try {
    const raw = readFileSync(resolve(process.cwd(), "corpus-manifest.json"), "utf8");
    const m = JSON.parse(raw);
    committedManifest = {
      disclosure: m.disclosure,
      provenance: m.provenance,
      docCount: m.docCount,
      domains: m.domains,
      sha256: m.sha256,
    };
  } catch (e) {
    console.error("[smoke:live] WARN could not read corpus-manifest.json:", e);
  }

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

  const report = await runSmoke(baseUrl, { expectedSha, fetchImpl, committedManifest });

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
