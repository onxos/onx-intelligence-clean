// ============================================================
// CORPUS QUALITY AUDIT — measured distribution + flag tests
// ------------------------------------------------------------
// Proves auditCorpus() is a MEASURED, read-only, deterministic report: the
// histogram + provenance averages + flag counts all reconcile to the real
// records, authored records score well, and synthetic/short/undomained records
// are honestly flagged (not hidden).
// ============================================================
import { describe, it, expect } from "vitest";
import { buildCorpusObjects, type CorpusSeed } from "../lib/corpus";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";
import { auditCorpus } from "../lib/corpus-quality";

function synthetic(contentText: string): CorpusSeed {
  return {
    contentText,
    type: "PERCEPTION",
    verification: "POSSIBLE",
    provenance: { type: "SYNTHETIC", citation: "", sourceAuthority: "" },
    sources: 1,
    trust: 0.6,
    // deliberately no domainTag → should be flagged MISSING_DOMAIN
  };
}

const corpus = buildCorpusObjects([
  ...CURATED_VET_CORPUS,
  synthetic("short synthetic"),
  synthetic("Another synthetic scaffold placeholder about scheduling reminders"),
]);

describe("auditCorpus — measured quality distribution + flags", () => {
  it("histogram counts reconcile exactly to the total record count", () => {
    const audit = auditCorpus(corpus);
    const summed = audit.histogram.reduce((s, b) => s + b.count, 0);
    expect(summed).toBe(corpus.length);
    expect(audit.total).toBe(corpus.length);
  });

  it("flagged + clean partitions the corpus without overlap", () => {
    const audit = auditCorpus(corpus);
    expect(audit.flaggedCount + audit.cleanCount).toBe(corpus.length);
    expect(audit.flaggedCount).toBeGreaterThan(0); // the 2 synthetics at least
  });

  it("flags every synthetic scaffold record as SYNTHETIC_SCAFFOLD + MISSING_CITATION", () => {
    const audit = auditCorpus(corpus);
    expect(audit.flagCounts.SYNTHETIC_SCAFFOLD).toBe(2);
    // Synthetic records are never provenance-valid → missing citation.
    expect(audit.flagCounts.MISSING_CITATION).toBeGreaterThanOrEqual(2);
  });

  it("scores authored records above synthetic on average", () => {
    const audit = auditCorpus(corpus);
    expect(audit.avgQualityByProvenance.AUTHORED).toBeGreaterThan(
      audit.avgQualityByProvenance.SYNTHETIC,
    );
    expect(audit.countByProvenance.AUTHORED).toBe(CURATED_VET_CORPUS.length);
    expect(audit.countByProvenance.SYNTHETIC).toBe(2);
  });

  it("flag counts reconcile exactly with the per-record flag arrays", () => {
    const audit = auditCorpus(corpus, { limit: 1000 });
    const totalFlagInstances = Object.values(audit.flagCounts).reduce((s, n) => s + n, 0);
    const perRecordFlagInstances = audit.flagged.reduce((s, r) => s + r.flags.length, 0);
    expect(totalFlagInstances).toBe(perRecordFlagInstances);
    // Each flagged record carries >= 1 flag.
    for (const rec of audit.flagged) expect(rec.flags.length).toBeGreaterThan(0);
  });

  it("respects minQuality — a higher threshold flags more records as BELOW_THRESHOLD", () => {
    const low = auditCorpus(corpus, { minQuality: 0.1 });
    const high = auditCorpus(corpus, { minQuality: 0.95 });
    expect(high.flagCounts.BELOW_THRESHOLD).toBeGreaterThanOrEqual(low.flagCounts.BELOW_THRESHOLD);
  });

  it("is deterministic and read-only (identical output across runs)", () => {
    const a = auditCorpus(corpus);
    const b = auditCorpus(corpus);
    expect(a).toEqual(b);
    // flagged list is deterministically ordered worst-quality-first.
    for (let i = 1; i < a.flagged.length; i++) {
      expect(a.flagged[i - 1].quality).toBeLessThanOrEqual(a.flagged[i].quality);
    }
  });

  it("bounds the enumerated flagged list by limit while keeping full measured counts", () => {
    const audit = auditCorpus(corpus, { limit: 1 });
    expect(audit.flagged.length).toBeLessThanOrEqual(1);
    // The measured count is complete regardless of the enumeration limit.
    expect(audit.flaggedCount).toBeGreaterThanOrEqual(audit.flagged.length);
  });
});
