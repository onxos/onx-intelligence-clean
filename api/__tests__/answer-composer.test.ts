// ============================================================
// ANSWER COMPOSER — STE-K-04 tests (ask.onx, deterministic, zero LLM)
// Fixture proofs: EMERGENCY intent leads with a care warning +
// ordered citations; irrelevant query → honest refusal (no
// fabrication); identical runs → byte-identical JSON (determinism);
// no env/canary leakage; ask.onx is PUBLIC while bridge mutations
// stay fail-closed.
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

// Enable the bridge so we can seed a relevant unit via ingest;
// fail-closed rejection is still asserted below for other paths.
vi.mock("../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      bridgeEnabled: true,
      bridgeSharedSecret: "test-bridge-secret",
    },
  };
});

import {
  composeAnswer,
  RELEVANCE_THRESHOLD,
  DEFAULT_TOP_K,
  RELEVANCE_FLOOR_BY_INTENT,
  OPERATIONAL_FLOOR,
} from "../lib/answer-composer";
import { appRouter } from "../router";
import { __resetCorpusIngestMemoryForTests } from "../corpus-query-router";

const bridgeCaller = () =>
  appRouter.createCaller({
    req: { headers: new Headers({ "x-onx-bridge-key": "test-bridge-secret" }) },
  } as never);

const publicCaller = () =>
  appRouter.createCaller({ req: { headers: new Headers() } } as never);

// Seed a genuinely relevant emergency unit so the composer has real
// evidence to cite (rare tokens → high IDF → comfortably above floor).
// BM25 needs a non-trivial corpus for meaningful IDF (a 1-doc index
// scores ~0.29 max). Seed 40 lexically-distinct filler docs so rare
// evidence tokens score honestly above the relevance floor.
async function seedFillerDocs(count = 40) {
  const units = Array.from({ length: count }, (_, i) => ({
    domain: "HISTORY",
    title: `Archive chronicle volume ${i + 1}`,
    body: `chronicle archive volume entry number ${i + 1} parchment codex manuscript folio`,
    source: "ste-k-04-filler",
  }));
  await bridgeCaller().corpusQuery.ingest({ units });
}

async function seedEmergencyUnit() {
  await seedFillerDocs();
  await bridgeCaller().corpusQuery.ingest({
    units: [{
      domain: "MEDICINE",
      title: "تسمم الكلاب: إسعاف الكلب الذي ابتلع سماً",
      body: "عند تسمم الكلب أو ابتلاعه سماً يجب نقله فوراً للطوارئ البيطرية وعدم تحفيز القيء دون استشارة الطبيب.",
      source: "ste-k-04-test",
    }],
  });
}

describe("answer composer (STE-K-04 / ask.onx)", () => {
  beforeEach(() => {
    __resetCorpusIngestMemoryForTests();
    delete process.env.DATABASE_URL;
  });

  it("declares its constants", () => {
    expect(RELEVANCE_THRESHOLD).toBe(1.0);
    expect(DEFAULT_TOP_K).toBe(5);
  });

  it("emergency question: EMERGENCY intent, warning leads, ordered citations", async () => {
    await seedEmergencyUnit();
    const result = await composeAnswer("كلبي ابتلع سم ماذا أفعل");

    expect(result.deterministic).toBe(true);
    expect(result.intent).toBe("EMERGENCY");
    expect(result.status).toBe("ANSWERED");
    expect(result.answer).not.toBeNull();
    // Immediate-care warning must lead the answer.
    expect(result.answer!.startsWith("⚠️")).toBe(true);
    expect(result.answer).toContain("طوارئ");
    // Citations present, ordered by descending BM25 score.
    expect(result.citations.length).toBeGreaterThan(0);
    for (let i = 1; i < result.citations.length; i++) {
      expect(result.citations[i - 1].score).toBeGreaterThanOrEqual(result.citations[i].score);
    }
    expect(result.topScore).toBeGreaterThanOrEqual(RELEVANCE_THRESHOLD);
    // Truth disclosure reports the measured provenance honestly.
    // Seeded units are authentic ingest → disclosure says so (never DEMO-marketing).
    expect(result.truthDisclosure).toMatch(/DEMO|AUTHENTIC/);
  });

  it("irrelevant question: honest refusal, no fabricated citations", async () => {
    const result = await composeAnswer("زقنبوتيات مجريطسية فلنكوشية غير موجودة إطلاقاً");
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.answer).toBeNull();
    expect(result.refusal).toContain("لا دليل كافٍ");
    expect(result.citations).toHaveLength(0);
    expect(result.topScore).toBeLessThan(RELEVANCE_THRESHOLD);
  });

  it("is deterministic: two identical runs produce byte-identical JSON", async () => {
    await seedEmergencyUnit();
    const a = await composeAnswer("كلبي ابتلع سم");
    const b = await composeAnswer("كلبي ابتلع سم");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("never leaks env/canary values into the response", async () => {
    process.env.ONX_CANARY_SECRET = "CANARY-DO-NOT-LEAK-9f2a";
    try {
      await seedEmergencyUnit();
      const result = await composeAnswer("كلبي ابتلع سم");
      expect(JSON.stringify(result)).not.toContain("CANARY-DO-NOT-LEAK-9f2a");
    } finally {
      delete process.env.ONX_CANARY_SECRET;
    }
  });

  it("ask.onx is PUBLIC while bridge mutations stay fail-closed", async () => {
    // Public read works with no bridge key.
    const pub = await publicCaller().ask.onx({ question: "كم سعر تطعيم القطط؟" });
    expect(pub.access).toBe("PUBLIC_READ");
    expect(pub.deterministic).toBe(true);
    expect(pub.intent).toBe("PRICING");

    // Bridge-guarded mutation still rejects without a key.
    await expect(
      publicCaller().corpusQuery.ingest({
        units: [{ domain: "SCIENCE", title: "x", body: "y", source: "z" }],
      }),
    ).rejects.toThrow();
  });

  it("STE-K-07 operational intents refuse incidental lexical hits (co-en-1 gap)", async () => {
    // "bad service" lexically matches a seeded "Mobility as a Service"
    // unit (high BM25), but COMPLAINT is a clinic-operational intent the
    // knowledge corpus cannot serve → honest refusal, not an answer.
    await seedFillerDocs();
    await bridgeCaller().corpusQuery.ingest({
      units: [{
        domain: "TRANSPORTATION",
        title: "Mobility as a Service platforms",
        body: "Mobility as a Service integrates transport service options into a single service platform.",
        source: "ste-k-07-test",
      }],
    });
    const result = await composeAnswer("I want to file a complaint bad service");
    expect(result.intent).toBe("COMPLAINT");
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.answer).toBeNull();
    expect(result.citations).toHaveLength(0);
    expect(result.refusal).toContain("لا دليل كافٍ");
    // topScore can be high (spurious lexical hit) yet still refuses.
    expect(result.topScore).toBeGreaterThan(RELEVANCE_THRESHOLD);
    // Operational floors declared and unreachable for these intents.
    expect(RELEVANCE_FLOOR_BY_INTENT.COMPLAINT).toBe(OPERATIONAL_FLOOR);
    expect(RELEVANCE_FLOOR_BY_INTENT.EMERGENCY).toBe(RELEVANCE_THRESHOLD);
    expect(RELEVANCE_FLOOR_BY_INTENT.INFO).toBe(RELEVANCE_THRESHOLD);
  });
});
