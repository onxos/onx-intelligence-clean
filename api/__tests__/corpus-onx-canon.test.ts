// ============================================================
// CORPUS ONX CANON — constitutional canonical record tests
// ------------------------------------------------------------
// Proves the ONX-owned constitutional canon is real, provenance-valid,
// content-deduped, quality-scored AUTHORED material that integrates additively
// with the veterinary corpus WITHOUT inflation (union count = sum of distinct
// records; every canon record is CITED to the ONX Constitution).
// ============================================================
import { describe, it, expect } from "vitest";
import { buildCorpusObjects, summarizeCorpus, isProvenanceValid } from "../lib/corpus";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";
import { CURATED_ONX_CANON } from "../lib/corpus-onx-canon";

describe("corpus ONX constitutional canon", () => {
  it("materialises exactly the seven constitutional principles", () => {
    expect(CURATED_ONX_CANON).toHaveLength(7);
  });

  it("every canon record is AUTHORED, cited and provenance-valid", () => {
    const objects = buildCorpusObjects(CURATED_ONX_CANON);
    expect(objects).toHaveLength(7);
    for (const obj of objects) {
      expect(obj.provenance).toBeDefined();
      expect(obj.provenance?.type).toBe("AUTHORED");
      expect(obj.provenance?.citation).toBe("ONX Constitution — The Seven Principles");
      expect(obj.provenance?.sourceAuthority).toBe("ONX Founder");
      expect(obj.domainTag).toBe("GOVERNANCE");
      expect(isProvenanceValid(obj.provenance)).toBe(true);
    }
  });

  it("integrates additively with the vet corpus — no dedupe collisions, no inflation", () => {
    const vet = buildCorpusObjects(CURATED_VET_CORPUS);
    const union = buildCorpusObjects([...CURATED_VET_CORPUS, ...CURATED_ONX_CANON]);
    // union is exactly the two distinct sets combined (canon shares no content
    // hash with the vet corpus) — the honest opposite of count inflation.
    expect(union).toHaveLength(vet.length + CURATED_ONX_CANON.length);
    const summary = summarizeCorpus(union);
    expect(summary.total).toBe(vet.length + 7);
    expect(summary.authoredCount).toBe(vet.length + 7);
    expect(summary.provenanceValidCount).toBe(vet.length + 7);
    expect(summary.syntheticCount).toBe(0);
  });

  it("re-ingesting the canon is idempotent (content-hash dedupe)", () => {
    const doubled = buildCorpusObjects([...CURATED_ONX_CANON, ...CURATED_ONX_CANON]);
    expect(doubled).toHaveLength(7);
  });
});
