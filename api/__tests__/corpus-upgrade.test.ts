// ============================================================
// STE-K-16 — corpus DEMO→REAL upgrade path (working code) tests.
// Deterministic, no DB, no LLM, no network. Proves: authentic docs
// validate + tag non-templated, ingesting them flips the MEASURED
// disclosure (DEMO→REAL when seed removed; MIXED conservative while
// any templated doc remains), the content sha256 changes legitimately,
// and the validation gate rejects seed-marker provenance.
// ============================================================
import { describe, it, expect } from "vitest";
import type { CorpusSearchDoc } from "../lib/corpus-search";
import { TEMPLATED_SEED_MARKER } from "../lib/corpus-manifest";
import {
  validateAuthenticDocs,
  toAuthenticSearchDocs,
  previewUpgrade,
  buildCorpusContentManifest,
  isTemplatedSeedDoc,
  type AuthenticDocInput,
} from "../lib/corpus-upgrade";

function seedDoc(id: string, domain: string, title: string): CorpusSearchDoc {
  return {
    id,
    domain,
    title,
    body: `Knowledge record about ${title}. ${TEMPLATED_SEED_MARKER}.`,
  };
}

const AUTHENTIC: AuthenticDocInput[] = [
  { domain: "MEDICINE", title: "Canine chocolate toxicity", body: "Theobromine dose thresholds and decontamination.", source: "AVMA Clinical Guidelines 2024" },
  { domain: "MEDICINE", title: "Feline vaccination schedule", body: "Core FVRCP and rabies timing by age.", source: "WSAVA 2023" },
  { id: "arch_7", domain: "STRATEGY", title: "SWOT in veterinary practice", body: "Applying SWOT to clinic operations.", source: "Harvard Business Review reprint" },
];

const SEED: CorpusSearchDoc[] = [
  seedDoc("kn_0", "STRATEGY", "SWOT Analysis"),
  seedDoc("kn_1", "MEDICINE", "Viral Pathogenesis"),
];

describe("STE-K-16 corpus upgrade path", () => {
  it("validates clean authentic docs and rejects seed-marker provenance / empties", () => {
    expect(validateAuthenticDocs(AUTHENTIC)).toHaveLength(0);

    const bad: AuthenticDocInput[] = [
      { domain: "", title: "t", body: "b", source: "real" }, // empty domain
      { domain: "D", title: "t", body: "b", source: "" }, // empty source
      { domain: "D", title: "t", body: "b", source: TEMPLATED_SEED_MARKER }, // seed marker as source
      { domain: "D", title: "t", body: `x ${TEMPLATED_SEED_MARKER}`, source: "real" }, // marker embedded in body
    ];
    const problems = validateAuthenticDocs(bad).map((i) => i.problem);
    expect(problems).toContain("empty domain");
    expect(problems).toContain("empty source (provenance required)");
    expect(problems.some((p) => p.includes("source equals templated seed marker"))).toBe(true);
    expect(problems.some((p) => p.includes("body embeds the templated seed marker"))).toBe(true);
  });

  it("tags converted docs non-templated and preserves per-doc provenance", () => {
    const docs = toAuthenticSearchDocs(AUTHENTIC);
    for (const d of docs) expect(isTemplatedSeedDoc(d)).toBe(false);
    // provenance preserved in the body's Source: line
    expect(docs[0].body).toContain("Source: AVMA Clinical Guidelines 2024");
    // explicit id honored, default id generated otherwise
    expect(docs[2].id).toBe("arch_7");
    expect(docs[0].id).toBe("auth_0");
  });

  it("flips the MEASURED disclosure to REAL when no templated doc remains", () => {
    // Ingesting into an EMPTY current corpus → purely authentic → REAL.
    const preview = previewUpgrade([], AUTHENTIC);
    expect(preview.before.disclosure).toBe("DEMO"); // empty corpus is honest DEMO
    expect(preview.after.disclosure).toBe("REAL");
    expect(preview.after.provenance).toBe("AUTHENTIC_INGEST");
    expect(preview.flipped).toBe(true);
    expect(preview.reachedReal).toBe(true);
    expect(preview.remainingTemplated).toBe(0);
    expect(preview.shaChanged).toBe(true);
  });

  it("stays conservatively DEMO/MIXED while any templated seed survives", () => {
    // Seed still present + authentic added → MIXED, disclosure DEMO.
    const preview = previewUpgrade(SEED, AUTHENTIC);
    expect(preview.before.disclosure).toBe("DEMO");
    expect(preview.before.provenance).toBe("TEMPLATED_SEED");
    expect(preview.after.provenance).toBe("MIXED");
    expect(preview.after.disclosure).toBe("DEMO"); // conservative — no false REAL
    expect(preview.reachedReal).toBe(false);
    expect(preview.remainingTemplated).toBe(SEED.length);
    expect(preview.shaChanged).toBe(true); // legitimate new baseline
    expect(preview.after.authenticDocs).toBe(AUTHENTIC.length);
  });

  it("the sha256 changes legitimately on authentic ingest (intended new baseline)", () => {
    const base = buildCorpusContentManifest(SEED).sha256;
    const after = previewUpgrade(SEED, AUTHENTIC).after.sha256;
    expect(after).not.toBe(base);
    expect(after).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic byte-for-byte across two runs of the same input", () => {
    const a = previewUpgrade(SEED, AUTHENTIC).after;
    const b = previewUpgrade(SEED, AUTHENTIC).after;
    expect(a).toEqual(b);
    expect(a.sha256).toBe(b.sha256);
  });

  it("is order-independent when every authentic doc carries an explicit id", () => {
    const ided: AuthenticDocInput[] = AUTHENTIC.map((d, i) => ({ ...d, id: `fix_${i}` }));
    const a = previewUpgrade(SEED, ided).after;
    const b = previewUpgrade([...SEED].reverse(), [...ided].reverse()).after;
    expect(a.sha256).toBe(b.sha256);
  });
});
