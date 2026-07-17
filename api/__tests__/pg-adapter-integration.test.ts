// ============================================================
// PERSISTENT MEMORY — pgvector ADAPTER INTEGRATION (B4)
//
// Resolves the recorded constraint `pg-adapter-untested`: the real
// PgVectorMemoryStore was only exercised against a mock/in-memory
// mirror in CI. This suite drives it against a LIVE Postgres with the
// pgvector extension — no mock query is used here, only the real `pg`
// driver.
//
// It runs (never skips) in CI via a `pgvector/pgvector:pg16` service
// container that provides PG_TEST_URL. Locally, when PG_TEST_URL is
// absent, the whole suite is cleanly SKIPPED so the deterministic
// keyless gate stays green without a database.
//
// Proven against live pg:
//   • put → the row (embedding vector(32), provenance jsonb, seq) is
//     really persisted; pgWrites increments, pgErrors stays 0
//   • get/search/export are served from the deterministic mirror and
//     match a parallel InMemoryMemoryStore byte-for-byte (mirror stays
//     deterministic regardless of pg)
//   • correct → old row flips corrected=true in pg, new row links via
//     supersedes; forget → forgotten=true + reason persisted
//   • fail-safe: cutting the connection mid-run makes writes bump
//     pgErrors and NEVER throw — the mirror keeps the store working
//   • the lazy real-pool path (resolvePool via DATABASE_URL) also
//     persists end-to-end
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import {
  PgVectorMemoryStore,
  InMemoryMemoryStore,
  EMBEDDING_DIM,
  type MemoryStore,
  type Provenance,
  type PgQuery,
} from "../lib/persistent-memory";

const PG_URL = process.env.PG_TEST_URL;
// Runs against live pg in CI; cleanly skipped locally when unset.
const suite = PG_URL ? describe : describe.skip;

const TABLE = "onx_memory_it";

const prov = (over: Partial<Provenance> = {}): Provenance => ({
  source: "integration-test",
  method: "deterministic",
  recordedAt: "2026-02-02T00:00:00.000Z",
  confidence: 0.7,
  ...over,
});

interface Row {
  id: string;
  kind: string;
  content: string;
  provenance: Provenance;
  corrected: boolean;
  supersedes: string | null;
  forgotten: boolean;
  forgotten_reason: string | null;
  seq: number;
}

suite("PgVectorMemoryStore — live pgvector integration (B4 pg-adapter-untested)", () => {
  let pool: Pool;
  let realQuery: PgQuery;

  beforeAll(async () => {
    pool = new Pool({ connectionString: PG_URL });
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await pool.query(
      `CREATE TABLE ${TABLE} (
         id text PRIMARY KEY,
         kind text NOT NULL,
         content text NOT NULL,
         embedding vector(${EMBEDDING_DIM}) NOT NULL,
         provenance jsonb NOT NULL,
         corrected boolean NOT NULL,
         supersedes text,
         forgotten boolean NOT NULL,
         forgotten_reason text,
         seq integer NOT NULL
       )`,
    );
    // Real driver seam — NOT a mock: every call hits live Postgres.
    realQuery = async (text, params) => {
      const res = await pool.query(text, params as unknown[]);
      return { rows: res.rows };
    };
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => undefined);
      await pool.end();
    }
  });

  async function fetchRow(id: string): Promise<Row | undefined> {
    const res = await pool.query(
      `SELECT id, kind, content, provenance, corrected, supersedes, forgotten, forgotten_reason, seq
         FROM ${TABLE} WHERE id = $1`,
      [id],
    );
    return res.rows[0] as Row | undefined;
  }

  it("persists a put to live pg (vector + jsonb) while reads stay deterministic", async () => {
    const store = new PgVectorMemoryStore({ query: realQuery, table: TABLE });
    const rec = await store.put({
      id: "it1",
      kind: "insight",
      content: "ذكرى تكامل حقيقية على pgvector",
      provenance: prov(),
    });

    expect(store.getStatus().mode).toBe("pg");
    expect(store.getStatus().pgWrites).toBe(1);
    expect(store.getStatus().pgErrors).toBe(0);

    const row = await fetchRow("it1");
    expect(row).toBeDefined();
    expect(row!.kind).toBe("insight");
    expect(row!.content).toBe("ذكرى تكامل حقيقية على pgvector");
    // jsonb round-trips to the mandatory provenance (parsed by node-pg).
    expect(row!.provenance.source).toBe("integration-test");
    expect(row!.provenance.confidence).toBe(0.7);
    expect(row!.forgotten).toBe(false);
    expect(row!.corrected).toBe(false);

    // The embedding really landed as a pgvector of the expected dimension.
    const dimRes = await pool.query(
      `SELECT vector_dims(embedding) AS d FROM ${TABLE} WHERE id = $1`,
      ["it1"],
    );
    expect(Number((dimRes.rows[0] as { d: number }).d)).toBe(EMBEDDING_DIM);
    expect(rec.embedding).toHaveLength(EMBEDDING_DIM);

    // Read served from the deterministic mirror, not from pg.
    const got = await store.get("it1");
    expect(got).toMatchObject({ id: "it1", content: "ذكرى تكامل حقيقية على pgvector" });
  });

  it("keeps search/get/export deterministic — identical to a parallel InMemory store", async () => {
    const pg = new PgVectorMemoryStore({ query: realQuery, table: TABLE });
    const mem: MemoryStore = new InMemoryMemoryStore();
    const rows = [
      { id: "d1", kind: "insight", content: "المنهج يرفع الإنتاجية بوضوح", provenance: prov() },
      { id: "d2", kind: "insight", content: "الفاتورة المتأخرة تحتاج متابعة", provenance: prov() },
      { id: "d3", kind: "note", content: "المنهج يرفع الإنتاجية", provenance: prov() },
    ];
    for (const r of rows) {
      await pg.put(r);
      await mem.put(r);
    }

    const q = { text: "المنهج يرفع الإنتاجية", kind: "insight" };
    const pgHits = await pg.search(q);
    const memHits = await mem.search(q);
    expect(pgHits.map((h) => h.record.id)).toEqual(memHits.map((h) => h.record.id));
    expect(pgHits.map((h) => h.similarity)).toEqual(memHits.map((h) => h.similarity));
    expect(pgHits[0].record.id).toBe("d1");

    const pgDump = await pg.export();
    const memDump = await mem.export();
    expect(pgDump.count).toBe(memDump.count);
    expect(pgDump.records.map((r) => r.id)).toEqual(memDump.records.map((r) => r.id));

    // All three insight/note rows are truly in pg.
    const countRes = await pool.query(
      `SELECT count(*)::int AS n FROM ${TABLE} WHERE id = ANY($1)`,
      [["d1", "d2", "d3"]],
    );
    expect((countRes.rows[0] as { n: number }).n).toBe(3);
  });

  it("persists correction (supersede) and intentional forgetting to live pg", async () => {
    const store = new PgVectorMemoryStore({ query: realQuery, table: TABLE });
    await store.put({ id: "c1", kind: "fact", content: "العاصمة القديمة بون", provenance: prov() });

    const corrected = await store.correct("c1", {
      content: "عاصمة ألمانيا برلين",
      provenance: prov({ method: "manual" }),
    });
    expect(corrected.supersedes).toBe("c1");

    const oldRow = await fetchRow("c1");
    const newRow = await fetchRow(corrected.id);
    expect(oldRow!.corrected).toBe(true); // superseded in pg
    expect(newRow!.supersedes).toBe("c1"); // new row links back in pg
    expect(newRow!.content).toBe("عاصمة ألمانيا برلين");

    await store.put({ id: "f1", kind: "note", content: "انسني", provenance: prov() });
    const forgotten = await store.forget("f1", "بطلب التدقيق");
    expect(forgotten.forgotten).toBe(true);

    const fRow = await fetchRow("f1");
    expect(fRow!.forgotten).toBe(true); // tagged soft-delete persisted
    expect(fRow!.forgotten_reason).toBe("بطلب التدقيق");

    // Forgotten row is hidden from get/search but retained in export.
    expect(await store.get("f1")).toBeNull();
    const dump = await store.export();
    expect(dump.records.find((r) => r.id === "f1")?.forgotten).toBe(true);
    expect(dump.forgottenCount).toBeGreaterThanOrEqual(1);
  });

  it("is fail-safe: cutting the connection mid-run bumps pgErrors and never throws", async () => {
    const tmpPool = new Pool({ connectionString: PG_URL });
    const q: PgQuery = async (text, params) => {
      const res = await tmpPool.query(text, params as unknown[]);
      return { rows: res.rows };
    };
    const store = new PgVectorMemoryStore({ query: q, table: TABLE });

    const ok = await store.put({ id: "fb1", kind: "note", content: "قبل القطع", provenance: prov() });
    expect(ok.id).toBe("fb1");
    expect(store.getStatus().pgWrites).toBe(1);
    expect(store.getStatus().pgErrors).toBe(0);
    // The pre-cut write really reached pg.
    expect(await fetchRow("fb1")).toBeDefined();

    // Cut the connection mid-run.
    await tmpPool.end();

    // Subsequent writes must NOT throw — the deterministic mirror absorbs it.
    const afterCut = await store.put({ id: "fb2", kind: "note", content: "بعد القطع", provenance: prov() });
    expect(afterCut.id).toBe("fb2");
    expect(await store.get("fb2")).not.toBeNull(); // mirror still authoritative
    const corrected = await store.forget("fb1", "تدقيق بعد القطع");
    expect(corrected.forgotten).toBe(true);
    expect(store.getStatus().pgErrors).toBeGreaterThanOrEqual(1);
    // fb2 never made it to pg (connection was down), proving the write path
    // truly targeted pg rather than silently succeeding.
    expect(await fetchRow("fb2")).toBeUndefined();
  });

  it("persists through the lazy real pool (resolvePool via DATABASE_URL)", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = PG_URL;
    try {
      // No injected query: forces the adapter to build a real pg Pool itself.
      const store = new PgVectorMemoryStore({ connectionString: PG_URL, table: TABLE });
      const rec = await store.put({
        id: "env1",
        kind: "note",
        content: "عبر مسار المجمّع الحقيقي",
        provenance: prov(),
      });
      expect(rec.id).toBe("env1");
      expect(store.getStatus().mode).toBe("pg");
      expect(store.getStatus().pgWrites).toBe(1);
      expect(store.getStatus().pgErrors).toBe(0);

      const row = await fetchRow("env1");
      expect(row).toBeDefined();
      expect(row!.content).toBe("عبر مسار المجمّع الحقيقي");
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });
});
