import { describe, it, expect } from "vitest";
import {
  RealityEngine,
  RealityError,
  runRealityPipeline,
  ingest,
  cleanInputs,
  extractFacts,
  parseText,
  applyOntology,
  buildKnowledgeGraph,
  detectContradictions,
  scopesOverlap,
  defaultOntology,
  contradictionToIntelligenceObject,
  type RawInput,
  type Provenance,
} from "../lib/reality-engine";

const prov = (confidence = 0.9, source = "test"): Provenance => ({
  source,
  method: "deterministic",
  recordedAt: "2026-07-12T00:00:00.000Z",
  confidence,
});

const t = (subject: string, predicate: string, object: string) => ({
  subject,
  predicate,
  object,
});

describe("B5 Reality Engine — ingest (fail-closed)", () => {
  it("rejects a non-array input", () => {
    // @ts-expect-error deliberate bad input
    expect(() => ingest(null)).toThrow(/INGEST_NOT_ARRAY/);
  });

  it("rejects an input without an id", () => {
    const bad = [{ text: "x is y", provenance: prov() }] as unknown as RawInput[];
    expect(() => ingest(bad)).toThrow(/INGEST_MISSING_ID/);
  });

  it("rejects duplicate ids", () => {
    const bad: RawInput[] = [
      { id: "a", text: "x is y", provenance: prov() },
      { id: "a", text: "p is q", provenance: prov() },
    ];
    expect(() => ingest(bad)).toThrow(/INGEST_DUP_ID/);
  });

  it("rejects an input with neither text nor triple", () => {
    const bad: RawInput[] = [{ id: "a", provenance: prov() }];
    expect(() => ingest(bad)).toThrow(/INGEST_EMPTY/);
  });

  it("rejects an input with missing provenance", () => {
    const bad = [{ id: "a", text: "x is y" }] as unknown as RawInput[];
    expect(() => ingest(bad)).toThrow(/INGEST_NO_PROVENANCE/);
  });

  it("rejects provenance with confidence out of [0,1]", () => {
    const bad: RawInput[] = [
      { id: "a", text: "x is y", provenance: { ...prov(), confidence: 5 } },
    ];
    expect(() => ingest(bad)).toThrow(/INGEST_BAD_CONFIDENCE/);
  });

  it("accepts a well-formed batch", () => {
    const ok: RawInput[] = [
      { id: "a", text: "Sun is star", provenance: prov() },
      { id: "b", triple: t("Paris", "capital-of", "France"), provenance: prov() },
    ];
    expect(ingest(ok)).toHaveLength(2);
  });
});

describe("B5 Reality Engine — clean + extract", () => {
  it("collapses whitespace and dedupes identical triples", () => {
    const inputs: RawInput[] = [
      { id: "a", triple: t("Paris", "capital-of", "France"), provenance: prov() },
      { id: "b", triple: t("paris", "Capital-Of", "france"), provenance: prov() },
    ];
    const cleaned = cleanInputs(ingest(inputs));
    expect(cleaned).toHaveLength(1);
  });

  it("parses explicit triples with certainty 1.0", () => {
    const { facts } = extractFacts(
      cleanInputs([
        { id: "a", triple: t("Paris", "capital-of", "France"), provenance: prov(0.8) },
      ]),
    );
    expect(facts[0].extractionCertainty).toBe(1);
    expect(facts[0].confidence).toBeCloseTo(0.8, 5);
    expect(facts[0].subject).toBe("Paris");
    expect(facts[0].predicate).toBe("capital-of");
  });

  it("parses pipe syntax 's | p | o'", () => {
    const parsed = parseText("Paris | capital-of | France");
    expect(parsed).not.toBeNull();
    expect(parsed?.subject).toBe("Paris");
    expect(parsed?.predicate).toBe("capital-of");
    expect(parsed?.object).toBe("France");
    expect(parsed?.certainty).toBe(0.9);
  });

  it("parses English copula 'is' / 'is not'", () => {
    expect(parseText("Sun is star")?.predicate).toBe("is");
    expect(parseText("Sun is not planet")?.predicate).toBe("is-not");
  });

  it("parses Arabic copula 'هو' / 'ليست'", () => {
    expect(parseText("الشمس هو نجم")?.predicate).toBe("is");
    expect(parseText("الشمس ليست كوكب")?.predicate).toBe("is-not");
  });

  it("reports unextractable free text instead of crashing", () => {
    const { facts, unextracted } = extractFacts(
      cleanInputs([{ id: "a", text: "غير قابل للتحليل", provenance: prov() }]),
    );
    expect(facts).toHaveLength(0);
    expect(unextracted).toEqual(["a"]);
  });

  it("multiplies source reliability by extraction certainty", () => {
    const { facts } = extractFacts(
      cleanInputs([{ id: "a", text: "Sun is star", provenance: prov(0.8) }]),
    );
    // copula certainty 0.75 * 0.8 source = 0.6
    expect(facts[0].confidence).toBeCloseTo(0.6, 5);
  });
});

describe("B5 Reality Engine — ontology validation", () => {
  it("flags unknown predicates (does not silently accept)", () => {
    const { facts } = extractFacts(
      cleanInputs([
        { id: "a", triple: t("X", "warps-into", "Y"), provenance: prov() },
      ]),
    );
    const { facts: validated, unknownPredicates } = applyOntology(
      facts,
      defaultOntology(),
    );
    expect(validated[0].ontologyStatus).toBe("UNKNOWN_PREDICATE");
    expect(unknownPredicates).toContain("warps-into");
  });

  it("marks known predicates KNOWN", () => {
    const { facts } = extractFacts(
      cleanInputs([
        { id: "a", triple: t("Paris", "capital-of", "France"), provenance: prov() },
      ]),
    );
    const { facts: validated } = applyOntology(facts, defaultOntology());
    expect(validated[0].ontologyStatus).toBe("KNOWN");
  });
});

describe("B5 Reality Engine — knowledge graph", () => {
  it("builds deterministic nodes and edges", () => {
    const { facts } = extractFacts(
      cleanInputs([
        { id: "a", triple: t("Paris", "capital-of", "France"), provenance: prov() },
        { id: "b", triple: t("Paris", "located-in", "Europe"), provenance: prov() },
      ]),
    );
    const g1 = buildKnowledgeGraph(facts);
    const g2 = buildKnowledgeGraph(facts);
    expect(g1).toEqual(g2);
    expect(g1.nodes.map((n) => n.id).sort()).toEqual(
      ["Europe", "France", "Paris"].sort(),
    );
    expect(g1.edges).toHaveLength(2);
    const paris = g1.nodes.find((n) => n.id === "Paris");
    expect(paris?.degree).toBe(2);
  });

  it("applies instance-of as a node type", () => {
    const { facts } = extractFacts(
      cleanInputs([
        { id: "a", triple: t("Paris", "instance-of", "Place"), provenance: prov() },
      ]),
    );
    const g = buildKnowledgeGraph(facts);
    expect(g.nodes.find((n) => n.id === "Paris")?.types).toContain("Place");
  });
});

describe("B5 Reality Engine — validity scope", () => {
  it("overlapping intervals overlap", () => {
    expect(
      scopesOverlap(
        { from: "2000-01-01", to: "2010-01-01" },
        { from: "2005-01-01", to: "2015-01-01" },
      ),
    ).toBe(true);
  });

  it("disjoint intervals do not overlap", () => {
    expect(
      scopesOverlap(
        { from: "1990-01-01", to: "1999-12-31" },
        { from: "2000-01-01", to: "2010-01-01" },
      ),
    ).toBe(false);
  });

  it("different domains never overlap", () => {
    expect(scopesOverlap({ domain: "law" }, { domain: "physics" })).toBe(false);
  });

  it("unbounded scopes overlap", () => {
    expect(scopesOverlap(undefined, undefined)).toBe(true);
  });
});

describe("B5 Reality Engine — contradiction detection", () => {
  const ont = defaultOntology();

  it("detects a functional conflict (same subject/predicate, different object)", () => {
    const { facts } = extractFacts(
      cleanInputs([
        { id: "a", triple: t("Paris", "capital-of", "France"), provenance: prov(0.9) },
        { id: "b", triple: t("Paris", "capital-of", "Germany"), provenance: prov(0.6) },
      ]),
    );
    const c = detectContradictions(applyOntology(facts, ont).facts, ont);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("FUNCTIONAL_CONFLICT");
    // higher confidence (0.9) wins
    expect(c[0].resolution.preferred).toBe("A");
    expect(c[0].resolution.by).toBe("CONFIDENCE");
  });

  it("detects a negation contradiction (is / is-not same object)", () => {
    const { facts } = extractFacts(
      cleanInputs([
        { id: "a", triple: t("Pluto", "is", "planet"), provenance: prov() },
        { id: "b", triple: t("Pluto", "is-not", "planet"), provenance: prov() },
      ]),
    );
    const c = detectContradictions(applyOntology(facts, ont).facts, ont);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("NEGATION");
  });

  it("does NOT flag time-scoped truths as contradictions", () => {
    const { facts } = extractFacts(
      cleanInputs([
        {
          id: "a",
          triple: t("Germany", "capital-of", "Bonn"),
          provenance: prov(),
          validityScope: { from: "1949-01-01", to: "1990-01-01" },
        },
        {
          id: "b",
          triple: t("Germany", "capital-of", "Berlin"),
          provenance: prov(),
          validityScope: { from: "1990-01-02", to: "2100-01-01" },
        },
      ]),
    );
    const c = detectContradictions(applyOntology(facts, ont).facts, ont);
    expect(c).toHaveLength(0);
  });

  it("flags overlapping-scope functional conflicts", () => {
    const { facts } = extractFacts(
      cleanInputs([
        {
          id: "a",
          triple: t("Germany", "capital-of", "Bonn"),
          provenance: prov(),
          validityScope: { from: "1949-01-01", to: "1995-01-01" },
        },
        {
          id: "b",
          triple: t("Germany", "capital-of", "Berlin"),
          provenance: prov(),
          validityScope: { from: "1990-01-01", to: "2100-01-01" },
        },
      ]),
    );
    const c = detectContradictions(applyOntology(facts, ont).facts, ont);
    expect(c).toHaveLength(1);
    expect(c[0].scopesOverlap).toBe(true);
  });

  it("resolves by governance hierarchy when authority levels are present", () => {
    const inputs: RawInput[] = [
      {
        id: "a",
        triple: t("Policy", "capital-of", "Old"),
        provenance: prov(0.5),
        authorityLevel: "ADVISORY",
      },
      {
        id: "b",
        triple: t("Policy", "capital-of", "New"),
        provenance: prov(0.5),
        authorityLevel: "CONSTITUTIONAL_PILLAR",
      },
    ];
    const { facts } = extractFacts(cleanInputs(ingest(inputs)));
    const c = detectContradictions(applyOntology(facts, ont).facts, ont);
    expect(c[0].resolution.by).toBe("HIERARCHY");
    // CONSTITUTIONAL_PILLAR outranks ADVISORY → B wins
    expect(c[0].resolution.preferred).toBe("B");
  });

  it("marks equal-confidence, no-authority conflicts UNRESOLVED (fail-closed)", () => {
    const { facts } = extractFacts(
      cleanInputs([
        { id: "a", triple: t("Paris", "capital-of", "France"), provenance: prov(0.7) },
        { id: "b", triple: t("Paris", "capital-of", "Germany"), provenance: prov(0.7) },
      ]),
    );
    const c = detectContradictions(applyOntology(facts, ont).facts, ont);
    expect(c[0].resolution.preferred).toBe("NONE");
    expect(c[0].resolution.by).toBe("UNRESOLVED");
  });
});

describe("B5 Reality Engine — full pipeline (ac-b5-graph)", () => {
  it("runs ingest → graph → contradictions end to end", () => {
    const inputs: RawInput[] = [
      { id: "s1", triple: t("Paris", "capital-of", "France"), provenance: prov(0.95) },
      { id: "s2", text: "Paris | located-in | Europe", provenance: prov(0.9) },
      { id: "s3", triple: t("Paris", "capital-of", "Germany"), provenance: prov(0.4) },
      { id: "s4", text: "unparseable line", provenance: prov() },
    ];
    const report = runRealityPipeline(inputs);
    expect(report.ingested).toBe(4);
    expect(report.facts.length).toBe(3);
    expect(report.unextracted).toEqual(["s4"]);
    expect(report.graph.edges.length).toBe(3);
    expect(report.contradictions.length).toBe(1);
    expect(report.contradictions[0].resolution.preferred).toBe("A");
  });

  it("is fully deterministic across runs", () => {
    const inputs: RawInput[] = [
      { id: "s1", triple: t("A", "capital-of", "B"), provenance: prov() },
      { id: "s2", triple: t("C", "located-in", "D"), provenance: prov() },
    ];
    expect(runRealityPipeline(inputs)).toEqual(runRealityPipeline(inputs));
  });
});

describe("B5 Reality Engine — engine + persistent memory (provenance, correction, forgetting, export)", () => {
  it("persists facts with provenance and exposes graph/contradictions", async () => {
    const eng = new RealityEngine();
    const res = await eng.ingest([
      { id: "s1", triple: t("Paris", "capital-of", "France"), provenance: prov() },
      { id: "s2", triple: t("Paris", "capital-of", "Germany"), provenance: prov(0.3) },
    ]);
    expect(res.facts).toHaveLength(2);
    expect(eng.graph().edges).toHaveLength(2);
    expect(eng.contradictions()).toHaveLength(1);
    const exp = await eng.export();
    expect(exp.records[0].provenance.source).toBe("test");
  });

  it("corrects a fact (audit-preserving supersede)", async () => {
    const eng = new RealityEngine();
    await eng.ingest([
      { id: "s1", triple: t("Paris", "capital-of", "Germany"), provenance: prov() },
    ]);
    const corrected = await eng.correctFact("fact-s1", "France", prov(0.99));
    expect(corrected.object).toBe("France");
    const exp = await eng.export();
    // export retains both the corrected original and the new record
    expect(exp.records.length).toBeGreaterThanOrEqual(2);
  });

  it("intentionally forgets a fact and drops it from the live graph", async () => {
    const eng = new RealityEngine();
    await eng.ingest([
      { id: "s1", triple: t("Paris", "capital-of", "France"), provenance: prov() },
    ]);
    await eng.forgetFact("fact-s1", "بيانات قديمة");
    expect(eng.graph().edges).toHaveLength(0);
    const exp = await eng.export();
    expect(exp.forgottenCount).toBe(1);
    expect(exp.records[0].forgottenReason).toBe("بيانات قديمة");
  });

  it("fails closed when forgetting without a reason", async () => {
    const eng = new RealityEngine();
    await eng.ingest([
      { id: "s1", triple: t("Paris", "capital-of", "France"), provenance: prov() },
    ]);
    await expect(eng.forgetFact("fact-s1", "  ")).rejects.toThrow(
      /FORGET_NO_REASON/,
    );
  });

  it("fails closed when correcting/forgetting a missing fact", async () => {
    const eng = new RealityEngine();
    await expect(eng.correctFact("nope", "x", prov())).rejects.toThrow(
      /FACT_NOT_FOUND/,
    );
    await expect(eng.forgetFact("nope", "reason")).rejects.toThrow(
      /FACT_NOT_FOUND/,
    );
  });

  it("ranks facts by deterministic similarity (keyless embedding)", async () => {
    const eng = new RealityEngine();
    await eng.ingest([
      { id: "s1", triple: t("Paris", "capital-of", "France"), provenance: prov() },
      { id: "s2", triple: t("Tokyo", "capital-of", "Japan"), provenance: prov() },
    ]);
    const ranked = eng.similarFacts("Paris capital-of France");
    expect(ranked[0].fact.id).toBe("fact-s1");
    // deterministic: same query → same ranking
    expect(eng.similarFacts("Paris capital-of France")).toEqual(ranked);
  });
});

describe("B5 Reality Engine — linking to Intelligence Objects (B4 reuse)", () => {
  it("turns a contradiction into an intelligence object and links an insight", () => {
    const inputs: RawInput[] = [
      { id: "s1", triple: t("Paris", "capital-of", "France"), provenance: prov(0.9) },
      { id: "s2", triple: t("Paris", "capital-of", "Germany"), provenance: prov(0.4) },
    ];
    const report = runRealityPipeline(inputs);
    const obj = contradictionToIntelligenceObject(
      report.contradictions[0],
      "insight-paris",
    );
    expect(obj.stage).toBe("QUESTION");
    expect(obj.question).toContain("Paris");
    expect(obj.linkedInsightIds).toContain("insight-paris");
  });

  it("rejects a non-insight id when linking (fail-closed from B4)", () => {
    const inputs: RawInput[] = [
      { id: "s1", triple: t("Paris", "capital-of", "France"), provenance: prov(0.9) },
      { id: "s2", triple: t("Paris", "capital-of", "Germany"), provenance: prov(0.4) },
    ];
    const report = runRealityPipeline(inputs);
    expect(() =>
      contradictionToIntelligenceObject(report.contradictions[0], "fact-s1"),
    ).toThrow(/NOT_AN_INSIGHT/);
  });

  it("surfaces RealityError with an inspectable code", () => {
    const err = new RealityError("X_CODE", "msg");
    expect(err.code).toBe("X_CODE");
    expect(err.message).toContain("[X_CODE]");
  });
});
