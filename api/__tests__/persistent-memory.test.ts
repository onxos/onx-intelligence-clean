// ============================================================
// PERSISTENT MEMORY — MemoryStore tests (B4)
//
// Proves the durable memory abstraction, deterministically & keyless:
//   • put/get with mandatory provenance; fail-closed on missing/invalid
//     provenance or empty content
//   • deterministic hash embedding + cosine similarity retrieval
//   • correction (supersede): the old record is hidden from search, the
//     new record links back via `supersedes`
//   • intentional forgetting (tagged soft-delete): hidden from get/search
//     yet retained (with the reason) in the audit export
//   • export returns the full ordered ledger including forgotten records
//   • the pgvector adapter shares the interface, mirrors writes to pg via
//     an injected query, and NEVER throws when pg fails (deterministic
//     fallback), while the factory defaults to the in-memory store
// ============================================================
import { describe, it, expect } from "vitest";
import {
  InMemoryMemoryStore,
  PgVectorMemoryStore,
  MemoryError,
  createMemoryStore,
  deterministicEmbedding,
  cosineSimilarity,
  toPgVector,
  type Provenance,
} from "../lib/persistent-memory";

const prov = (over: Partial<Provenance> = {}): Provenance => ({
  source: "reflection-cycle",
  method: "deterministic",
  recordedAt: "2026-01-01T00:00:00.000Z",
  confidence: 0.8,
  ...over,
});

describe("deterministic embedding + similarity", () => {
  it("is pure: identical text yields identical vectors", () => {
    expect(deterministicEmbedding("مرحبا بالعالم")).toEqual(deterministicEmbedding("مرحبا بالعالم"));
  });

  it("scores identical text as maximally similar and unrelated text lower", () => {
    const a = deterministicEmbedding("قياس الإنتاجية في المنهج");
    const b = deterministicEmbedding("قياس الإنتاجية في المنهج");
    const c = deterministicEmbedding("طقس المريخ اليوم غائم");
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(a, c)).toBeLessThan(cosineSimilarity(a, b));
  });
});

describe("InMemoryMemoryStore — write/read with provenance", () => {
  it("stores a record with its provenance and deterministic embedding", async () => {
    const store = new InMemoryMemoryStore();
    const rec = await store.put({ id: "m1", kind: "note", content: "أول ذكرى", provenance: prov() });
    expect(rec.provenance.source).toBe("reflection-cycle");
    expect(rec.embedding).toEqual(deterministicEmbedding("أول ذكرى"));
    expect(rec.forgotten).toBe(false);
    expect(await store.get("m1")).toMatchObject({ id: "m1", content: "أول ذكرى" });
  });

  it("fail-closed: missing provenance, bad confidence, bad timestamp, empty content", async () => {
    const store = new InMemoryMemoryStore();
    await expect(store.put({ id: "x", kind: "note", content: "c" } as never)).rejects.toThrow(/NO_PROVENANCE/);
    await expect(store.put({ id: "x", kind: "note", content: "c", provenance: prov({ confidence: 2 }) })).rejects.toThrow(/BAD_CONFIDENCE/);
    await expect(store.put({ id: "x", kind: "note", content: "c", provenance: prov({ recordedAt: "not-a-date" }) })).rejects.toThrow(/BAD_TIMESTAMP/);
    await expect(store.put({ id: "x", kind: "note", content: "  ", provenance: prov() })).rejects.toThrow(/EMPTY_FIELD/);
  });

  it("refuses a duplicate id (correction is the sanctioned path)", async () => {
    const store = new InMemoryMemoryStore();
    await store.put({ id: "m1", kind: "note", content: "a", provenance: prov() });
    await expect(store.put({ id: "m1", kind: "note", content: "b", provenance: prov() })).rejects.toThrow(/DUPLICATE/);
  });
});

describe("InMemoryMemoryStore — similarity retrieval", () => {
  it("ranks the closest record first and filters by kind", async () => {
    const store = new InMemoryMemoryStore();
    await store.put({ id: "a", kind: "insight", content: "المنهج يرفع الإنتاجية بشكل واضح", provenance: prov() });
    await store.put({ id: "b", kind: "insight", content: "الفاتورة المتأخرة تحتاج متابعة", provenance: prov() });
    await store.put({ id: "c", kind: "note", content: "المنهج يرفع الإنتاجية", provenance: prov() });

    const hits = await store.search({ text: "المنهج يرفع الإنتاجية", kind: "insight" });
    expect(hits[0].record.id).toBe("a");
    expect(hits.every((h) => h.record.kind === "insight")).toBe(true);
    expect(hits.find((h) => h.record.id === "c")).toBeUndefined();
  });

  it("fail-closed on an empty query", async () => {
    const store = new InMemoryMemoryStore();
    await expect(store.search({ text: "" })).rejects.toThrow(/EMPTY_FIELD/);
  });
});

describe("InMemoryMemoryStore — correction", () => {
  it("supersedes the old record: it links back and is hidden from search", async () => {
    const store = new InMemoryMemoryStore();
    await store.put({ id: "m1", kind: "fact", content: "العاصمة برلين قديمًا بون", provenance: prov() });
    const corrected = await store.correct("m1", { content: "عاصمة ألمانيا برلين", provenance: prov({ method: "manual" }) });

    expect(corrected.supersedes).toBe("m1");
    expect(corrected.id).not.toBe("m1");
    const old = await store.get("m1");
    expect(old?.corrected).toBe(true);

    // Search excludes the corrected (superseded) record.
    const hits = await store.search({ text: "عاصمة ألمانيا", kind: "fact" });
    expect(hits.some((h) => h.record.id === "m1")).toBe(false);
    expect(hits.some((h) => h.record.id === corrected.id)).toBe(true);
  });

  it("fail-closed: correcting a missing or forgotten record throws", async () => {
    const store = new InMemoryMemoryStore();
    await expect(store.correct("ghost", { content: "x", provenance: prov() })).rejects.toThrow(/NOT_FOUND/);
    await store.put({ id: "m1", kind: "note", content: "a", provenance: prov() });
    await store.forget("m1", "obsolete");
    await expect(store.correct("m1", { content: "b", provenance: prov() })).rejects.toThrow(/FORGOTTEN/);
  });
});

describe("InMemoryMemoryStore — intentional forgetting + export", () => {
  it("hides forgotten records from get/search but keeps them (with reason) in export", async () => {
    const store = new InMemoryMemoryStore();
    await store.put({ id: "keep", kind: "note", content: "أبقِني", provenance: prov() });
    await store.put({ id: "gone", kind: "note", content: "انسني", provenance: prov() });
    const forgotten = await store.forget("gone", "بطلب المؤسس");

    expect(forgotten.forgotten).toBe(true);
    expect(forgotten.forgottenReason).toBe("بطلب المؤسس");
    expect(await store.get("gone")).toBeNull();
    expect(await store.get("gone", true)).not.toBeNull();

    const hits = await store.search({ text: "انسني" });
    expect(hits.some((h) => h.record.id === "gone")).toBe(false);
    // Explicit includeForgotten surfaces it again.
    const withForgotten = await store.search({ text: "انسني", includeForgotten: true });
    expect(withForgotten.some((h) => h.record.id === "gone")).toBe(true);

    const dump = await store.export();
    expect(dump.count).toBe(2);
    expect(dump.forgottenCount).toBe(1);
    const goneRow = dump.records.find((r) => r.id === "gone");
    expect(goneRow?.forgotten).toBe(true);
    expect(goneRow?.forgottenReason).toBe("بطلب المؤسس");
    // Export is ordered by insertion sequence (deterministic).
    expect(dump.records.map((r) => r.seq)).toEqual([...dump.records.map((r) => r.seq)].sort((a, b) => a - b));
  });
});

describe("PgVectorMemoryStore — adapter parity + deterministic fallback", () => {
  it("serialises embeddings as a pgvector literal", () => {
    expect(toPgVector([1, -0.5, 0])).toBe("[1,-0.5,0]");
  });

  it("mirrors writes to pg via an injected query while reads stay deterministic", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const store = new PgVectorMemoryStore({
      connectionString: "postgres://x",
      query: async (text, params) => {
        calls.push({ text, params });
        return { rows: [] };
      },
    });
    const rec = await store.put({ id: "m1", kind: "insight", content: "ذكرى متجهية", provenance: prov() });

    expect(store.getStatus().mode).toBe("pg");
    expect(store.getStatus().pgWrites).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/INSERT INTO onx_memory_record/);
    expect(calls[0].text).toMatch(/\$4::vector/);
    // The vector param is the deterministic embedding literal.
    expect(calls[0].params?.[3]).toBe(toPgVector(rec.embedding));

    // Reads/search served from the deterministic mirror.
    const hits = await store.search({ text: "ذكرى متجهية" });
    expect(hits[0].record.id).toBe("m1");
  });

  it("never throws when pg fails — falls back to the mirror and counts the error", async () => {
    const store = new PgVectorMemoryStore({
      connectionString: "postgres://x",
      query: async () => {
        throw new Error("connection refused");
      },
    });
    // put resolves despite the pg failure; the record is still readable.
    const rec = await store.put({ id: "safe", kind: "note", content: "آمن", provenance: prov() });
    expect(rec.id).toBe("safe");
    expect(await store.get("safe")).not.toBeNull();
    expect(store.getStatus().pgErrors).toBeGreaterThanOrEqual(1);
  });

  it("factory defaults to the deterministic in-memory store without a connection string", () => {
    const store = createMemoryStore({ connectionString: undefined });
    expect(store).toBeInstanceOf(InMemoryMemoryStore);
    expect(createMemoryStore({ connectionString: "postgres://x" })).toBeInstanceOf(PgVectorMemoryStore);
  });

  it("still enforces fail-closed validation through the adapter", async () => {
    const store = new PgVectorMemoryStore({ connectionString: "postgres://x", query: async () => ({ rows: [] }) });
    await expect(store.put({ id: "x", kind: "note", content: "c" } as never)).rejects.toThrow(MemoryError);
  });
});
