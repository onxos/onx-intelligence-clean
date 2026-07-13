// ============================================================
// GOLDEN EVAL RUNNER — STE-K-06 (institutional quality ratchet)
// Runs the deterministic golden evaluation, prints the honest JSON
// report, and gates against committed floors (api/fixtures/
// eval-floors.json).
//
// Exit code:
//   1 — any measured metric is BELOW its pinned floor (regression).
//   0 — all metrics meet/exceed floors. When a metric strictly
//       exceeds its floor, stderr advises raising it (ratchet).
//
// Run: npm run eval:golden
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runGoldenEval, checkFloors, intentsCovered, type EvalFloors } from "../api/lib/eval-harness";

const here = dirname(fileURLToPath(import.meta.url));
const FLOORS_PATH = resolve(here, "../api/fixtures/eval-floors.json");

async function main() {
  const report = await runGoldenEval();
  const floors = JSON.parse(readFileSync(FLOORS_PATH, "utf8")) as EvalFloors;
  const gate = checkFloors(report, floors);

  console.log(JSON.stringify(report, null, 2));

  console.error(
    `[eval:golden] total=${report.total} intentAccuracy=${report.intentAccuracy} ` +
      `refusalHonesty=${report.refusalHonesty} retrievalHitAtK=${report.retrievalHitAtK} ` +
      `(corpus=${report.corpusDisclosure}, intents=${intentsCovered().length}/7)`,
  );

  for (const f of gate.failures) {
    console.error(`[eval:golden] FAIL ${f.metric}: measured ${f.measured} < floor ${f.floor}`);
  }
  for (const a of gate.advisories) {
    console.error(
      `[eval:golden] ADVISE raise ${a.metric} floor: measured ${a.measured} > floor ${a.floor}`,
    );
  }

  process.exit(gate.passed ? 0 : 1);
}

main().catch((error) => {
  console.error("[eval:golden] failed:", error);
  process.exit(1);
});
