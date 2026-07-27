// ============================================================
// verify:corpus — STE-K-10 corpus integrity gate (keyless, no LLM,
// no network, no DB). Recomputes CURRENT_RUNTIME_CORPUS and asserts
// it matches the committed contract exactly. TARGET_LICENSED_CORPUS
// is a separate, pinned objective (25k licensed/open records); it is
// never counted as current or described as deployed.
//
//   npm run verify:corpus            → verify, exit 1 on any mismatch
//   npm run verify:corpus -- --write → regenerate the committed file
//
// The committed current manifest pins what the runtime actually
// registers. Any tampering (add / remove / relabel a unit) changes
// the sha256 → gate fails. --write updates only from measurement and
// preserves the separate non-deployed licensed target.
// Run: tsx --tsconfig tsconfig.server.json scripts/verify-corpus.ts
// Tested by: api/__tests__/corpus-content-manifest.test.ts
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import "../api/knowledge-router"; // registers the seed corpus source
import {
  buildLiveCorpusReport,
  buildCorpusTruthContract,
  validateCorpusTruthContract,
  type CorpusTruthContract,
  type CorpusContentManifest,
} from "../api/lib/corpus-manifest";

const MANIFEST_PATH = resolve(process.cwd(), "corpus-manifest.json");

function stableCurrentManifest(m: CorpusContentManifest): CorpusContentManifest {
  return {
    version: m.version,
    source: m.source,
    docCount: m.docCount,
    domains: m.domains,
    provenance: m.provenance,
    disclosure: m.disclosure,
    templatedDocs: m.templatedDocs,
    authenticDocs: m.authenticDocs,
    sha256: m.sha256,
  };
}

function stableStringify(contract: CorpusTruthContract): string {
  // Fixed key order so the committed file is byte-stable.
  return JSON.stringify(
    {
      contractVersion: contract.contractVersion,
      currentRuntimeCorpus: stableCurrentManifest(contract.currentRuntimeCorpus),
      targetLicensedCorpus: {
        state: contract.targetLicensedCorpus.state,
        deploymentStatus: contract.targetLicensedCorpus.deploymentStatus,
        minimumDocCount: contract.targetLicensedCorpus.minimumDocCount,
        historicalTemplatedSeedReferenceDocCount:
          contract.targetLicensedCorpus.historicalTemplatedSeedReferenceDocCount,
        requiredProvenance: contract.targetLicensedCorpus.requiredProvenance,
        syntheticGenerationAllowed:
          contract.targetLicensedCorpus.syntheticGenerationAllowed,
      },
    },
    null,
    2,
  );
}

async function main() {
  const write = process.argv.includes("--write");
  const { manifest, structureIssues } = await buildLiveCorpusReport();
  const measuredContract = buildCorpusTruthContract(manifest);

  if (write) {
    writeFileSync(MANIFEST_PATH, stableStringify(measuredContract) + "\n", "utf8");
    console.log("=== verify:corpus (--write) ===");
    console.log(`wrote ${MANIFEST_PATH}`);
    console.log(stableStringify(measuredContract));
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
  let committed: CorpusTruthContract | null = null;
  try {
    committed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    failures.push(`missing/unreadable ${MANIFEST_PATH} (run with --write)`);
  }

  if (committed) {
    failures.push(...validateCorpusTruthContract(committed, manifest));
  }

  const report = {
    gate: "verify:corpus",
    keyless: true,
    currentRuntimeCorpus: {
      docCount: manifest.docCount,
      domains: manifest.domains.length,
      provenance: manifest.provenance,
      disclosure: manifest.disclosure,
      sha256: manifest.sha256,
    },
    targetLicensedCorpus: measuredContract.targetLicensedCorpus,
    structureIssues: structureIssues.length,
    ok: failures.length === 0,
    failures,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
