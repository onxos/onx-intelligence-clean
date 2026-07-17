import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import {
  CLINIC_RELEVANCE_THRESHOLD,
  ClinicAssistantError,
  assessClinicCase,
  classifyClinicSeverity,
} from "../lib/clinic-assistant-engine";
import {
  __resetClinicAssistantStoreForTests,
  getClinicAccuracy,
  getClinicAssessments,
  recordClinicAssessment,
  recordClinicOutcome,
} from "../lib/clinic-assistant-store";

function fakeSearch(hits: Array<{ id: string; domain: string; title: string; score: number }>) {
  return async (
    _query: string,
    _options?: { domain?: string; limit?: number; offset?: number },
  ): Promise<CorpusSearchResult> => ({
    engine: "BM25",
    k1: 1.2,
    b: 0.75,
    indexedDocs: hits.length,
    totalMatches: hits.length,
    hits: hits.map((h) => ({ ...h, snippet: `…${h.title}…` })),
  });
}

const STRONG = fakeSearch([
  { id: "c1", domain: "MEDICINE", title: "Respiratory emergency protocol", score: 8.5 },
  { id: "c2", domain: "MEDICINE", title: "Cyanosis intervention", score: 5.1 },
]);
const WEAK = fakeSearch([{ id: "w1", domain: "MISC", title: "non-clinical note", score: 0.2 }]);
const NONE = fakeSearch([]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetClinicAssistantStoreForTests();
});

describe("clinic-assistant engine validation", () => {
  it("rejects missing species", async () => {
    await expect(
      assessClinicCase(
        { species: "", chiefComplaint: "c", symptoms: ["s"] },
        { search: STRONG },
      ),
    ).rejects.toBeInstanceOf(ClinicAssistantError);
  });

  it("rejects missing complaint", async () => {
    await expect(
      assessClinicCase(
        { species: "canine", chiefComplaint: "", symptoms: ["s"] },
        { search: STRONG },
      ),
    ).rejects.toThrow(/MISSING_COMPLAINT/);
  });

  it("rejects empty symptoms", async () => {
    await expect(
      assessClinicCase(
        { species: "canine", chiefComplaint: "c", symptoms: [] },
        { search: STRONG },
      ),
    ).rejects.toThrow(/MISSING_SYMPTOMS/);
  });
});

describe("clinic-assistant severity + assessment", () => {
  it("classifies emergency wording as CRITICAL", () => {
    expect(classifyClinicSeverity("difficulty breathing", ["cyanosis"])).toBe("CRITICAL");
  });

  it("creates ACTIONABLE grounded assessment from strong evidence", async () => {
    const a = await assessClinicCase(
      {
        species: "canine",
        chiefComplaint: "difficulty breathing",
        symptoms: ["cyanosis", "collapse"],
      },
      { search: STRONG },
    );
    expect(a.severity).toBe("CRITICAL");
    expect(a.verdict).toBe("ACTIONABLE");
    expect(a.evidence.length).toBe(2);
    expect(a.authorityLevel).toBe("A2");
    expect(a.authorityDecision).toBe("GRANTED");
    expect(a.status).toBe("EXECUTED_ELIGIBLE");
    expect(a.evalScore).toBeGreaterThan(0);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails honest below threshold", async () => {
    const a = await assessClinicCase(
      {
        species: "feline",
        chiefComplaint: "mild note",
        symptoms: ["itching"],
      },
      { search: WEAK },
    );
    expect(a.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(a.rationale).toContain("fail-honest");
    expect(a.evalScore).toBeLessThan(1);
  });

  it("fails honest with no hits", async () => {
    const a = await assessClinicCase(
      {
        species: "equine",
        chiefComplaint: "unknown",
        symptoms: ["weakness"],
      },
      { search: NONE },
    );
    expect(a.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(a.evidence).toHaveLength(0);
    expect(a.evalScore).toBe(0);
  });

  it("threshold stays strict", () => {
    expect(CLINIC_RELEVANCE_THRESHOLD).toBe(1);
  });
});

describe("clinic-assistant durable memory + outcome feedback", () => {
  it("persists and reads back newest first in honest UNPERSISTED mode", async () => {
    const a1 = await assessClinicCase(
      {
        species: "canine",
        chiefComplaint: "vomiting",
        symptoms: ["diarrhea", "lethargy"],
      },
      { search: STRONG },
    );
    const a2 = await assessClinicCase(
      {
        species: "canine",
        chiefComplaint: "difficulty breathing",
        symptoms: ["cyanosis"],
      },
      { search: STRONG },
    );
    const r1 = await recordClinicAssessment(a1);
    const r2 = await recordClinicAssessment(a2);
    expect(r1.persistence).toBe("UNPERSISTED");
    expect(r2.id).toBeGreaterThan(r1.id);
    const history = await getClinicAssessments({ species: "canine", limit: 10 });
    expect(history.count).toBe(2);
    expect(history.assessments[0].id).toBe(r2.id);
    expect(history.assessments[0].outcome).toBe("PENDING");
  });

  it("records outcomes and recomputes accuracy", async () => {
    const a = await recordClinicAssessment(
      await assessClinicCase(
        {
          species: "feline",
          chiefComplaint: "vomiting",
          symptoms: ["dehydration"],
        },
        { search: STRONG },
      ),
    );
    const b = await recordClinicAssessment(
      await assessClinicCase(
        {
          species: "feline",
          chiefComplaint: "rash",
          symptoms: ["itching"],
        },
        { search: STRONG },
      ),
    );
    await recordClinicOutcome(a.id, "IMPROVED", "stabilized");
    await recordClinicOutcome(b.id, "NOT_IMPROVED", "needs escalation");
    const metric = await getClinicAccuracy("feline");
    expect(metric.total).toBe(2);
    expect(metric.resolved).toBe(2);
    expect(metric.improved).toBe(1);
    expect(metric.notImproved).toBe(1);
    expect(metric.accuracy).toBe(0.5);
  });
});
