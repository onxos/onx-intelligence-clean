// ============================================================
// CORPUS PROVENANCE EXPORT — deterministic manifest + verify tests
// ------------------------------------------------------------
// Proves the manifest is a byte-stable, order-independent audit anchor and that
// verifyManifest() detects drift honestly (missing / extra / content / metadata
// changes) — the basis for independent verification and re-ingestion without
// inflation.
// ============================================================
import { describe, it, expect } from "vitest";
import { buildCorpusObjects, type CorpusSeed } from "../lib/corpus";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";
import { exportCorpusManifest, verifyManifest } from "../lib/corpus-export";

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

const corpus = buildCorpusObjects([
  ...CURATED_VET_CORPUS,
  synthetic("Synthetic scaffold placeholder alpha"),
]);

describe("exportCorpusManifest / verifyManifest", () => {
  it("counts reconcile with the corpus (measured, no inflation)", () => {
    const m = exportCorpusManifest(corpus);
    expect(m.total).toBe(corpus.length);
    expect(m.records.length).toBe(corpus.length);
    expect(m.provenanceValidCount).toBe(CURATED_VET_CORPUS.length);
    const byProv =
      m.countByProvenance.AUTHORED + m.countByProvenance.INGESTED + m.countByProvenance.SYNTHETIC;
    expect(byProv).toBe(corpus.length);
  });

  it("is deterministic and order-independent (same hash regardless of input order)", () => {
    const a = exportCorpusManifest(corpus);
    const reversed = exportCorpusManifest([...corpus].reverse());
    expect(reversed.manifestHash).toBe(a.manifestHash);
    // records are id-sorted → identical order across runs
    expect(reversed.records.map((r) => r.id)).toEqual(a.records.map((r) => r.id));
  });

  it("every record digest carries a content hash; provenance-valid ones are cited", () => {
    const m = exportCorpusManifest(corpus);
    for (const r of m.records) {
      expect(r.contentHash).toMatch(/^[0-9a-f]{64}$/);
      if (r.provenanceValid) {
        expect(r.citation).toBeTruthy();
        expect(r.sourceAuthority).toBeTruthy();
      }
    }
  });

  it("verifies a fresh manifest against its own corpus as valid", () => {
    const m = exportCorpusManifest(corpus);
    const v = verifyManifest(corpus, m);
    expect(v.valid).toBe(true);
    expect(v.mismatches).toHaveLength(0);
    expect(v.actualHash).toBe(v.expectedHash);
    expect(v.recordCount).toBe(corpus.length);
  });

  it("detects a dropped record (MISSING_IN_CORPUS) and invalidates the hash", () => {
    const m = exportCorpusManifest(corpus);
    const v = verifyManifest(corpus.slice(1), m);
    expect(v.valid).toBe(false);
    expect(v.actualHash).not.toBe(v.expectedHash);
    expect(v.mismatches.some((x) => x.kind === "MISSING_IN_CORPUS")).toBe(true);
  });

  it("detects an added record (EXTRA_IN_CORPUS)", () => {
    const m = exportCorpusManifest(corpus);
    const extended = buildCorpusObjects([
      ...CURATED_VET_CORPUS,
      synthetic("Synthetic scaffold placeholder alpha"),
      synthetic("Synthetic scaffold placeholder beta added later"),
    ]);
    const v = verifyManifest(extended, m);
    expect(v.valid).toBe(false);
    expect(v.mismatches.some((x) => x.kind === "EXTRA_IN_CORPUS")).toBe(true);
  });

  it("detects content drift (CONTENT_HASH_DRIFT) when a record's text changes", () => {
    const m = exportCorpusManifest(corpus);
    // Mutate one record's content but keep its id → identity must change.
    const tampered = corpus.map((o, i) =>
      i === 0 ? { ...o, contentText: `${o.contentText} TAMPERED`, contentHash: undefined } : o,
    );
    const v = verifyManifest(tampered, m);
    expect(v.valid).toBe(false);
    expect(v.mismatches.some((x) => x.kind === "CONTENT_HASH_DRIFT")).toBe(true);
  });

  it("detects metadata change (METADATA_CHANGED) without content change", () => {
    const m = exportCorpusManifest(corpus);
    const tampered = corpus.map((o, i) => (i === 0 ? { ...o, quality: (o.quality ?? 0) + 0.01 } : o));
    const v = verifyManifest(tampered, m);
    expect(v.valid).toBe(false);
    expect(v.mismatches.some((x) => x.kind === "METADATA_CHANGED")).toBe(true);
  });
});
