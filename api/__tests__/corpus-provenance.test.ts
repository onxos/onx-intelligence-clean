import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../router";
import { clearIucSnapshots, replaceIurgObjects } from "../lib/iurg-store";
import {
  buildCorpusObjects,
  contentHash,
  isProvenanceValid,
  qualityScore,
  searchCorpus,
  summarizeCorpus,
  type CorpusSeed,
} from "../lib/corpus";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";
import type { Provenance } from "../iuc-engine";

const caller = appRouter.createCaller({} as any);

const AUTHORED: Provenance = {
  type: "AUTHORED",
  citation: "AAHA Canine Vaccination Guidelines",
  sourceAuthority: "AAHA",
};
const SYNTHETIC: Provenance = { type: "SYNTHETIC", citation: "", sourceAuthority: "" };

function synthetic(contentText: string, domainTag = "MEDICINE"): CorpusSeed {
  return {
    contentText,
    type: "PERCEPTION",
    verification: "POSSIBLE",
    provenance: SYNTHETIC,
    sources: 1,
    trust: 0.6,
    domainTag,
  };
}

describe("corpus content identity (dedupe key)", () => {
  it("hashes are stable and normalize case/whitespace", () => {
    const a = contentHash("Parvovirus is a serious canine disease.");
    const b = contentHash("  parvovirus   IS a   Serious canine DISEASE.  ");
    expect(a).toBe(b);
  });

  it("distinct content yields distinct hashes", () => {
    expect(contentHash("amoxicillin dosing")).not.toBe(contentHash("parvovirus symptoms"));
  });
});

describe("provenance validity gate", () => {
  it("accepts authored records with a real citation", () => {
    expect(isProvenanceValid(AUTHORED)).toBe(true);
  });

  it("rejects synthetic scaffold, missing provenance, and empty citations", () => {
    expect(isProvenanceValid(SYNTHETIC)).toBe(false);
    expect(isProvenanceValid(undefined)).toBe(false);
    expect(isProvenanceValid({ type: "AUTHORED", citation: "   ", sourceAuthority: "AAHA" })).toBe(false);
    expect(isProvenanceValid({ type: "INGESTED", citation: "Dataset X", sourceAuthority: "" })).toBe(false);
  });
});

describe("deterministic quality scoring", () => {
  it("is deterministic (no randomness) and bounded to [0,1]", () => {
    const input = { contentText: "cited verified statement", provenance: AUTHORED, sources: 3, verification: "CONFIRMED" as const, trust: 0.9 };
    const first = qualityScore(input);
    const second = qualityScore(input);
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(1);
  });

  it("ranks cited+verified authored records above unsourced synthetic scaffold", () => {
    const authored = qualityScore({ contentText: "A".repeat(280), provenance: AUTHORED, sources: 4, verification: "PROVEN", trust: 0.95 });
    const synth = qualityScore({ contentText: "A".repeat(280), provenance: SYNTHETIC, sources: 1, verification: "POSSIBLE", trust: 0.6 });
    expect(authored).toBeGreaterThan(synth);
  });
});

describe("buildCorpusObjects", () => {
  it("attaches provenance, quality, content hash and deterministic id", () => {
    const [obj] = buildCorpusObjects([
      { contentText: "Test statement", provenance: AUTHORED, verification: "CONFIRMED", sources: 3, trust: 0.9 },
    ]);
    expect(obj.provenance).toEqual(AUTHORED);
    expect(typeof obj.quality).toBe("number");
    expect(obj.contentHash).toBe(contentHash("Test statement"));
    expect(obj.id).toBe(`corpus-${contentHash("Test statement").slice(0, 24)}`);
  });

  it("dedupes by content hash so reseeding never inflates counts", () => {
    const seeds: CorpusSeed[] = [
      { contentText: "Same fact", provenance: AUTHORED, verification: "CONFIRMED" },
      { contentText: "  SAME   fact ", provenance: AUTHORED, verification: "CONFIRMED" },
    ];
    const built = buildCorpusObjects(seeds);
    expect(built).toHaveLength(1);

    const rebuilt = buildCorpusObjects([...seeds, ...seeds]);
    expect(rebuilt.map((o) => o.id)).toEqual(built.map((o) => o.id));
  });
});

describe("summarizeCorpus (measured, honest)", () => {
  it("separates provenance-valid records from synthetic scaffold", () => {
    const built = buildCorpusObjects([
      { contentText: "Authored fact one", provenance: AUTHORED, verification: "CONFIRMED" },
      { contentText: "Authored fact two", provenance: AUTHORED, verification: "CONFIRMED" },
      synthetic("Synthetic scaffold placeholder one"),
    ]);
    const summary = summarizeCorpus(built);
    expect(summary.total).toBe(3);
    expect(summary.authoredCount).toBe(2);
    expect(summary.provenanceValidCount).toBe(2);
    expect(summary.syntheticCount).toBe(1);
    expect(summary.avgProvenanceValidQuality).toBeGreaterThan(summary.avgQuality);
  });
});

describe("searchCorpus (cited retrieval)", () => {
  const built = buildCorpusObjects([
    { contentText: "Canine parvovirus causes severe hemorrhagic gastroenteritis in unvaccinated puppies.", provenance: AUTHORED, verification: "PROVEN", sources: 4, trust: 0.95, domainTag: "MEDICINE" },
    synthetic("Synthetic scaffold about parvovirus placeholder text."),
  ]);

  it("returns empty for an empty query", () => {
    expect(searchCorpus(built, "   ")).toEqual([]);
  });

  it("returns cited hits and ranks provenance-valid records first", () => {
    const hits = searchCorpus(built, "parvovirus");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].provenanceValid).toBe(true);
    expect(hits[0].citation).toBeTruthy();
    expect(hits[0].sourceAuthority).toBe("AAHA");
  });

  it("respects the limit", () => {
    expect(searchCorpus(built, "parvovirus", 1)).toHaveLength(1);
  });
});

describe("curated veterinary corpus is provenance-valid", () => {
  it("every curated record is authored, cited and provenance-valid", () => {
    expect(CURATED_VET_CORPUS.length).toBeGreaterThanOrEqual(40);
    for (const seed of CURATED_VET_CORPUS) {
      expect(seed.provenance.type).toBe("AUTHORED");
      expect(isProvenanceValid(seed.provenance)).toBe(true);
    }
  });

  it("has no duplicate content (unique identities)", () => {
    const hashes = new Set(CURATED_VET_CORPUS.map((s) => contentHash(s.contentText)));
    expect(hashes.size).toBe(CURATED_VET_CORPUS.length);
  });
});

describe.sequential("corpus router integration (persisted, measured)", () => {
  beforeEach(async () => {
    await replaceIurgObjects([]);
    await clearIucSnapshots();
  });

  it("corpusStatus reports honest measured provenance counts from the DB", async () => {
    const built = buildCorpusObjects([
      ...CURATED_VET_CORPUS,
      synthetic("Synthetic scaffold placeholder alpha"),
      synthetic("Synthetic scaffold placeholder beta"),
      synthetic("Synthetic scaffold placeholder gamma"),
    ]);
    const summary = summarizeCorpus(built);
    await replaceIurgObjects(built);

    const status = await caller.iuc.corpusStatus();
    expect(status.totalObjects).toBe(built.length);
    expect(status.provenanceValidCount).toBe(summary.provenanceValidCount);
    expect(status.authoredCount).toBe(summary.authoredCount);
    expect(status.syntheticCount).toBe(3);
    expect(status.provenanceValidCount).toBe(CURATED_VET_CORPUS.length);
    expect(status.avgProvenanceValidQuality).toBeGreaterThan(0);
  });

  it("corpusSearch returns cited hits and provenanceValidOnly filters scaffold out", async () => {
    const built = buildCorpusObjects([
      ...CURATED_VET_CORPUS,
      synthetic("Synthetic scaffold vaccine placeholder text"),
    ]);
    await replaceIurgObjects(built);

    const res = await caller.iuc.corpusSearch({ query: "vaccine", limit: 5, provenanceValidOnly: false });
    expect(res.returned).toBeGreaterThan(0);
    expect(res.corpusSize).toBe(built.length);

    const filtered = await caller.iuc.corpusSearch({ query: "vaccine", limit: 50, provenanceValidOnly: true });
    expect(filtered.searched).toBe(CURATED_VET_CORPUS.length);
    for (const hit of filtered.results) {
      expect(hit.provenanceValid).toBe(true);
      expect(hit.citation).toBeTruthy();
    }
  });
});
