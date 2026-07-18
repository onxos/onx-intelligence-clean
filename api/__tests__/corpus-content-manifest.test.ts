// ============================================================
// STE-K-10 — corpus content manifest + verify:corpus gate logic.
// Deterministic, no DB, no LLM, no network. Proves: two-run byte
// stability, provenance→disclosure measurement (DEMO seed vs REAL
// authentic vs MIXED), tamper detection via sha256, and the
// minimal-structure gate.
// ============================================================
import { describe, it, expect } from "vitest";
import type { CorpusSearchDoc } from "../lib/corpus-search";
import {
  buildCorpusContentManifest,
  classifyProvenance,
  findStructureIssues,
  isTemplatedSeedDoc,
  TEMPLATED_SEED_MARKER,
  CORPUS_MANIFEST_VERSION,
  getCorpusContentManifest,
} from "../lib/corpus-manifest";

function seedDoc(id: string, domain: string, title: string): CorpusSearchDoc {
  return {
    id,
    domain,
    title,
    body: `Knowledge record about ${title}. Source: ONX Knowledge Base v1.0.`,
  };
}
function authenticDoc(id: string, domain: string, title: string): CorpusSearchDoc {
  return { id, domain, title, body: `Authentic clinical note on ${title}.` };
}

const SEED_SET: CorpusSearchDoc[] = [
  seedDoc("kn_2", "MEDICINE", "Immunology Basics"),
  seedDoc("kn_0", "STRATEGY", "SWOT Analysis"),
  seedDoc("kn_1", "MEDICINE", "Viral Pathogenesis"),
];

describe("STE-K-10 corpus content manifest", () => {
  it("is deterministic byte-for-byte across two runs (order-independent)", () => {
    const a = buildCorpusContentManifest(SEED_SET);
    const b = buildCorpusContentManifest([...SEED_SET].reverse());
    expect(a).toEqual(b);
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.version).toBe(CORPUS_MANIFEST_VERSION);
  });

  it("measures DEMO for a fully templated seed", () => {
    const m = buildCorpusContentManifest(SEED_SET);
    expect(m.provenance).toBe("TEMPLATED_SEED");
    expect(m.disclosure).toBe("DEMO");
    expect(m.templatedDocs).toBe(3);
    expect(m.authenticDocs).toBe(0);
    expect(m.docCount).toBe(3);
    expect(m.domains).toEqual(["MEDICINE", "STRATEGY"]); // sorted, unique
  });

  it("flips disclosure to REAL only when NO templated doc remains", () => {
    const authentic = buildCorpusContentManifest([
      authenticDoc("a1", "MEDICINE", "Canine toxicity protocol"),
      authenticDoc("a2", "MEDICINE", "Feline vaccination schedule"),
    ]);
    expect(authentic.provenance).toBe("AUTHENTIC_INGEST");
    expect(authentic.disclosure).toBe("REAL");

    // A single surviving templated doc keeps the honest DEMO label.
    const mixed = buildCorpusContentManifest([
      authenticDoc("a1", "MEDICINE", "Canine toxicity protocol"),
      seedDoc("kn_0", "STRATEGY", "SWOT Analysis"),
    ]);
    expect(mixed.provenance).toBe("MIXED");
    expect(mixed.disclosure).toBe("DEMO");
  });

  it("classifyProvenance covers empty / templated / authentic / mixed", () => {
    expect(classifyProvenance(0, 0).provenance).toBe("EMPTY");
    expect(classifyProvenance(5, 0).disclosure).toBe("DEMO");
    expect(classifyProvenance(0, 5).disclosure).toBe("REAL");
    expect(classifyProvenance(3, 2).provenance).toBe("MIXED");
    expect(classifyProvenance(3, 2).disclosure).toBe("DEMO");
  });

  it("detects tampering: add / remove / relabel changes the sha256", () => {
    const base = buildCorpusContentManifest(SEED_SET).sha256;
    // add
    expect(
      buildCorpusContentManifest([...SEED_SET, seedDoc("kn_9", "SCIENCE", "Entropy")]).sha256,
    ).not.toBe(base);
    // remove
    expect(buildCorpusContentManifest(SEED_SET.slice(1)).sha256).not.toBe(base);
    // relabel a title
    const relabeled = SEED_SET.map((d, i) =>
      i === 0 ? { ...d, title: d.title + " (edited)" } : d,
    );
    expect(buildCorpusContentManifest(relabeled).sha256).not.toBe(base);
  });

  it("ignores per-boot random body: identity hash is body-independent", () => {
    const withRandomBody = SEED_SET.map((d) => ({
      ...d,
      body: d.body + ` importance ${Math.random()}`,
    }));
    expect(buildCorpusContentManifest(withRandomBody).sha256).toBe(
      buildCorpusContentManifest(SEED_SET).sha256,
    );
  });

  it("isTemplatedSeedDoc keys off the literal seed marker", () => {
    expect(TEMPLATED_SEED_MARKER).toBe("Source: ONX Knowledge Base v1.0");
    expect(isTemplatedSeedDoc(seedDoc("k", "D", "T"))).toBe(true);
    expect(isTemplatedSeedDoc(authenticDoc("a", "D", "T"))).toBe(false);
  });

  it("structure gate flags empty id / domain / text", () => {
    const bad: CorpusSearchDoc[] = [
      { id: "", domain: "MEDICINE", title: "t", body: "b" },
      { id: "x", domain: "  ", title: "t", body: "b" },
      { id: "y", domain: "MEDICINE", title: "t", body: "" },
      seedDoc("ok", "MEDICINE", "fine"),
    ];
    const issues = findStructureIssues(bad);
    expect(issues.map((i) => i.problem).sort()).toEqual([
      "empty domain",
      "empty id",
      "empty text/body",
    ]);
    expect(findStructureIssues([seedDoc("ok", "MEDICINE", "fine")])).toHaveLength(0);
  });

  it("live manifest over the shipped seed measures DEMO with 19 domains", async () => {
    // Importing knowledge-router seeds the corpus source on load.
    await import("../knowledge-router");
    const live = await getCorpusContentManifest();
    expect(live.disclosure).toBe("DEMO");
    expect(live.provenance).toBe("TEMPLATED_SEED");
    expect(live.docCount).toBe(22500);
    expect(live.domains.length).toBe(19);
    expect(live.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic: two live reads are identical.
    const again = await getCorpusContentManifest();
    expect(again).toEqual(live);
  }, 120000); // seeds + collects 22.5k docs; generous under parallel load
});
