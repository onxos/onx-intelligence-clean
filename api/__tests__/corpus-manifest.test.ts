// ============================================================
// STE-N-01 CORPUS MANIFEST — deterministic dedup measurement
// Proves the ingest→fingerprint→dedup pipeline locally (no DB),
// and pins the TRUE unique count vs the raw seeded total.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  buildCorpusManifest,
  fingerprintKnowledge,
  getKnowledgeHealthSnapshot,
  normalizeKnowledgeText,
} from "../knowledge-router";

describe("Corpus manifest (STE-N-01)", () => {
  it("measures the real seeded store, not a claim", () => {
    const snap = getKnowledgeHealthSnapshot();
    // Sum of DOMAINS recordCount in knowledge-router.ts:38-56 = 22,500
    expect(snap.records).toBe(22500);
    expect(snap.domains).toBe(19);
  });

  it("normalization is stable across whitespace/case variants", () => {
    expect(normalizeKnowledgeText("SWOT  Analysis", "Body\n\ntext")).toBe(
      normalizeKnowledgeText("swot analysis", "body text"),
    );
    expect(fingerprintKnowledge("A Title", "Same body")).toBe(
      fingerprintKnowledge("a  title", " same body "),
    );
    expect(fingerprintKnowledge("A Title", "Body 1")).not.toBe(
      fingerprintKnowledge("A Title", "Body 2"),
    );
  });

  it("dedup pipeline: sample ingest with duplicates collapses to unique set", () => {
    const sample = [
      { title: "Parvovirus symptoms", body: "vomiting, diarrhea, fever" },
      { title: "PARVOVIRUS  SYMPTOMS", body: " vomiting, diarrhea, fever " }, // dup (normalized)
      { title: "Kennel cough triage", body: "dry cough, vaccination history" },
      { title: "Kennel cough triage", body: "different body content" }, // NOT a dup (body differs)
    ];
    const before = sample.length;
    const unique = new Set(sample.map((s) => fingerprintKnowledge(s.title, s.body)));
    expect(before).toBe(4);
    expect(unique.size).toBe(3);
  });

  it("builds a full-store manifest with honest unique-vs-raw counts", () => {
    const manifest = buildCorpusManifest();
    expect(manifest.rawTotal).toBe(22500);
    // Titles are unique by construction (`topic — domain N`), so the measured
    // unique counts must equal the raw total and duplicates must be zero.
    expect(manifest.uniqueByTitleOnly).toBe(22500);
    expect(manifest.uniqueByTitleBody).toBe(22500);
    expect(manifest.duplicates).toBe(0);
    expect(Object.keys(manifest.byDomain)).toHaveLength(19);
    const domainRawSum = Object.values(manifest.byDomain).reduce((s, d) => s + d.raw, 0);
    expect(domainRawSum).toBe(manifest.rawTotal);
  });
});
