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
import { buildCorpusGraph, relatedByQuery } from "../api/lib/corpus-graph";
import { vectorSearchCorpus } from "../api/lib/corpus-vector";
import { planRetention } from "../api/lib/corpus-retention";
import { accessBreakdown, filterByClearance } from "../api/lib/corpus-access";
import { indexSearchCorpus, buildInvertedIndex, indexStats } from "../api/lib/corpus-index";
import { corpusPersistenceProof } from "../api/lib/corpus-health";
import { hybridSearch } from "../api/lib/corpus-hybrid";
import { auditCorpus } from "../api/lib/corpus-quality";
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

  // Graph-augmented retrieval evidence: deterministic knowledge graph over the
  // SAME persisted objects, plus a query-driven cited-neighbour traversal (what
  // iuc.corpusGraph / iuc.corpusRelated return).
  const graph = buildCorpusGraph(persisted);
  console.log("\n=== MEASURED corpus graph (deterministic, over persisted objects) ===");
  console.log(JSON.stringify({
    recordNodes: graph.stats.recordNodes,
    authorityNodes: graph.stats.authorityNodes,
    domainNodes: graph.stats.domainNodes,
    edges: graph.stats.edges,
    byEdgeType: graph.stats.byEdgeType,
    topAuthorities: graph.stats.topAuthorities.slice(0, 5),
  }, null, 2));

  const graphQuery = "parvovirus";
  const related = relatedByQuery(persisted, graphQuery, 3);
  console.log(`\n=== GRAPH cited neighbours: "${graphQuery}" ===`);
  console.log(JSON.stringify({
    seed: related.seed,
    related: related.related.map((r) => ({
      relation: r.relation,
      sharedAuthority: r.sharedAuthority,
      sharedTerms: r.sharedTerms,
      sourceAuthority: r.sourceAuthority,
      citation: r.citation,
      excerpt: r.excerpt.slice(0, 100),
    })),
  }, null, 2));

  // Vector retrieval evidence: TF-IDF cosine over the SAME persisted objects
  // (what iuc.corpusVectorSearch returns). Honestly labelled — not embeddings.
  for (const query of ["canine parvovirus", "chronic kidney disease staging"]) {
    const hits = vectorSearchCorpus(persisted, query, 2);
    console.log(`\n=== VECTOR (tf-idf cosine) retrieval: "${query}" ===`);
    console.log(JSON.stringify(hits.map((h) => ({
      similarity: h.similarity,
      matchedTerms: h.matchedTerms,
      sourceAuthority: h.sourceAuthority,
      citation: h.citation,
      excerpt: h.excerpt.slice(0, 100),
    })), null, 2));
  }

  // Retention evidence: dry-run plan (pure, no mutation) proving provenance-valid
  // records are ALWAYS preserved while synthetic scaffold is prunable. MEASURED.
  const plan = planRetention(persisted, { dropSynthetic: true });
  console.log("\n=== RETENTION plan (dry-run, provenance-preserving) ===");
  console.log(JSON.stringify({
    policy: plan.policy,
    beforeTotal: plan.before.total,
    afterTotal: plan.after.total,
    prunedByReason: plan.prunedByReason,
    provenanceValidBefore: plan.before.provenanceValidCount,
    provenanceValidAfter: plan.after.provenanceValidCount,
    provenanceValidPreserved: plan.provenanceValidPreserved,
  }, null, 2));

  // Inverted-index BM25 evidence: measured index structure + selective indexed
  // retrieval (only docs containing a query term are examined) over persisted.
  const invIndex = buildInvertedIndex(persisted);
  console.log("\n=== INVERTED INDEX (bm25) stats + selective retrieval ===");
  const idxStats = indexStats(invIndex);
  const bm25 = indexSearchCorpus(persisted, "canine parvovirus", 2);
  console.log(JSON.stringify({
    docCount: idxStats.docCount,
    termCount: idxStats.termCount,
    postingsCount: idxStats.postingsCount,
    avgDocLength: idxStats.avgDocLength,
    query: bm25.query,
    candidatesExamined: bm25.candidates,
    ofTotalDocs: idxStats.docCount,
    topHit: bm25.hits[0] && {
      score: bm25.hits[0].score,
      matchedTerms: bm25.hits[0].matchedTerms,
      sourceAuthority: bm25.hits[0].sourceAuthority,
      citation: bm25.hits[0].citation,
    },
  }, null, 2));

  // Access-control evidence: overlay one RESTRICTED demo record on the persisted
  // (all-PUBLIC) corpus and show that a PUBLIC viewer cannot read it while a
  // RESTRICTED viewer can — enforcement is real, measured, not cosmetic.
  const restrictedDemo = buildCorpusObjects([{
    contentText: "Founder constitutional directive codenamed zeta governs restricted sovereignty escalations",
    type: "UNDERSTANDING",
    verification: "CONFIRMED",
    provenance: { type: "AUTHORED", citation: "ONX Constitution: Directive Zeta", sourceAuthority: "ONX Founder" },
    sources: 3,
    trust: 0.95,
    domainTag: "GOVERNANCE",
    accessTier: "RESTRICTED",
  }])[0];
  const withRestricted = [...persisted, restrictedDemo];
  console.log("\n=== ACCESS CONTROL (clearance-tier enforcement, +1 RESTRICTED demo) ===");
  console.log(JSON.stringify({
    publicViewer: accessBreakdown(withRestricted, "PUBLIC"),
    restrictedViewer: { visible: filterByClearance(withRestricted, "RESTRICTED").length },
    publicCanReadRestrictedRecord: filterByClearance(withRestricted, "PUBLIC").some((o) => o.id === restrictedDemo.id),
    restrictedCanReadRestrictedRecord: filterByClearance(withRestricted, "RESTRICTED").some((o) => o.id === restrictedDemo.id),
  }, null, 2));

  // Hybrid retrieval evidence: fuse BM25 + TF-IDF + graph into one CITED ranking.
  const hybrid = hybridSearch(persisted, "canine parvovirus vaccination", 3);
  console.log("\n=== HYBRID RETRIEVAL (BM25 + TF-IDF + graph, weighted fusion) ===");
  console.log(JSON.stringify({
    query: hybrid.query,
    model: hybrid.model,
    weights: hybrid.weights,
    signalReach: hybrid.signalReach,
    topHit: hybrid.hits[0] && {
      fusedScore: hybrid.hits[0].fusedScore,
      components: hybrid.hits[0].components,
      signals: hybrid.hits[0].signals,
      sourceAuthority: hybrid.hits[0].sourceAuthority,
      citation: hybrid.hits[0].citation,
    },
  }, null, 2));

  // Quality audit evidence: measured distribution + honest flags.
  const audit = auditCorpus(persisted);
  console.log("\n=== QUALITY AUDIT (measured distribution + per-record flags) ===");
  console.log(JSON.stringify({
    total: audit.total,
    avgQuality: audit.avgQuality,
    histogram: audit.histogram.map((b) => `[${b.from}-${b.to}]=${b.count}`),
    avgQualityByProvenance: audit.avgQualityByProvenance,
    flagCounts: audit.flagCounts,
    flaggedCount: audit.flaggedCount,
    cleanCount: audit.cleanCount,
  }, null, 2));

  // Durable-pg proof: report whether the corpus adapter REALLY persists to
  // Postgres on THIS process's DATABASE_URL, via a live read-after-write.
  // Locally (no postgres DATABASE_URL) it honestly reports MEMORY; in CI /
  // prod with a postgres url it reports POSTGRES only after a verified
  // round-trip. Never a text flag — the proof self-cleans its probe row.
  const proof = await corpusPersistenceProof();
  console.log("\n=== DURABLE-PG PROOF (live read-after-write; honest fallback) ===");
  console.log(JSON.stringify({
    mode: proof.mode,
    persistence: proof.persistence,
    roundTrip: proof.roundTrip,
    writtenBack: proof.writtenBack,
    latencyMs: proof.latencyMs,
    note: proof.note,
  }, null, 2));
}

main().catch((error) => {
  console.error("corpus:evidence failed", error);
  process.exitCode = 1;
});
