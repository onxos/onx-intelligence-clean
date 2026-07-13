// ============================================================
// STE-N-01 — Corpus dedup manifest (deterministic, no DB, no LLM)
// Fingerprints every knowledge unit (sha256 of normalized
// title+body) across all available sources and prints the TRUE
// unique count vs the raw total, per domain.
//
// Run: npm run corpus:manifest
//   (= npx tsx --tsconfig tsconfig.server.json scripts/corpus-dedup-manifest.ts)
// Tested by: api/__tests__/corpus-manifest.test.ts
// ============================================================
import { buildCorpusManifest, getKnowledgeHealthSnapshot } from "../api/knowledge-router";

function main() {
  const snapshot = getKnowledgeHealthSnapshot();
  const manifest = buildCorpusManifest();

  console.log("=== STE-N-01 corpus dedup manifest ===");
  console.log(`store (measured, not claimed): ${snapshot.records} records / ${snapshot.domains} domains`);
  console.log(`rawTotal:            ${manifest.rawTotal}`);
  console.log(`uniqueByTitleBody:   ${manifest.uniqueByTitleBody}`);
  console.log(`uniqueByTitleOnly:   ${manifest.uniqueByTitleOnly}`);
  console.log(`duplicates:          ${manifest.duplicates}`);
  console.log("byDomain (raw/unique):");
  for (const [domain, stats] of Object.entries(manifest.byDomain).sort()) {
    console.log(`  ${domain.padEnd(16)} ${String(stats.raw).padStart(6)} / ${stats.unique}`);
  }

  const floor = 25000;
  console.log(`gap vs ${floor} floor (D-6): ${Math.max(0, floor - manifest.uniqueByTitleBody)} units of unique fingerprints`);
  console.log("NOTE: fingerprint uniqueness != authentic knowledge; see docs/CORPUS_GAP_REPORT.md");
}

main();
