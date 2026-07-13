// ============================================================
// verify:corpus — STE-K-10 corpus integrity gate (keyless, no LLM,
// no network, no DB). Recomputes the corpus content manifest from
// the live seed and asserts it matches the committed contract
// corpus-manifest.json, plus a minimal-structure check (every doc
// has a non-empty id / domain / text).
//
//   npm run verify:corpus            → verify, exit 1 on any mismatch
//   npm run verify:corpus -- --write → regenerate the committed file
//
// The committed manifest pins the SHIPPED DEMO seed. Any tampering
// (add / remove / relabel a unit) changes the sha256 → gate fails.
// When the authentic archive replaces the seed, run with --write to
// re-pin; the measured `disclosure` flips DEMO→REAL on its own.
// Run: tsx --tsconfig tsconfig.server.json scripts/verify-corpus.ts
// Tested by: api/__tests__/corpus-content-manifest.test.ts
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import "../api/knowledge-router"; // registers the seed corpus source
import {
  buildLiveCorpusReport,
  type CorpusContentManifest,
} from "../api/lib/corpus-manifest";

const MANIFEST_PATH = resolve(process.cwd(), "corpus-manifest.json");

function stableStringify(m: CorpusContentManifest): string {
  // Fixed key order so the committed file is byte-stable.
  return JSON.stringify(
    {
      version: m.version,
      source: m.source,
      docCount: m.docCount,
      domains: m.domains,
      provenance: m.provenance,
      disclosure: m.disclosure,
      templatedDocs: m.templatedDocs,
      authenticDocs: m.authenticDocs,
      sha256: m.sha256,
    },
    null,
    2,
  );
}

async function main() {
  const write = process.argv.includes("--write");
  const { manifest, structureIssues } = await buildLiveCorpusReport();

  if (write) {
    writeFileSync(MANIFEST_PATH, stableStringify(manifest) + "\n", "utf8");
    console.log("=== verify:corpus (--write) ===");
    console.log(`wrote ${MANIFEST_PATH}`);
    console.log(stableStringify(manifest));
    process.exit(0);
  }

  const failures: string[] = [];

  // 1) Minimal document structure.
  if (structureIssues.length > 0) {
    failures.push(`${structureIssues.length} structural issue(s)`);
    for (const s of structureIssues.slice(0, 5))
      failures.push(`  doc#${s.index} (${s.id}): ${s.problem}`);
  }

  // 2) Committed contract must exist and match the live measurement.
  let committed: CorpusContentManifest | null = null;
  try {
    committed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    failures.push(`missing/unreadable ${MANIFEST_PATH} (run with --write)`);
  }

  if (committed) {
    const checks: Array<[string, unknown, unknown]> = [
      ["sha256", committed.sha256, manifest.sha256],
      ["docCount", committed.docCount, manifest.docCount],
      ["provenance", committed.provenance, manifest.provenance],
      ["disclosure", committed.disclosure, manifest.disclosure],
      ["version", committed.version, manifest.version],
      ["domains", JSON.stringify(committed.domains), JSON.stringify(manifest.domains)],
    ];
    for (const [field, want, got] of checks) {
      if (want !== got)
        failures.push(`${field} mismatch: committed=${want} live=${got}`);
    }
  }

  const report = {
    gate: "verify:corpus",
    keyless: true,
    live: {
      docCount: manifest.docCount,
      domains: manifest.domains.length,
      provenance: manifest.provenance,
      disclosure: manifest.disclosure,
      sha256: manifest.sha256,
    },
    structureIssues: structureIssues.length,
    ok: failures.length === 0,
    failures,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
