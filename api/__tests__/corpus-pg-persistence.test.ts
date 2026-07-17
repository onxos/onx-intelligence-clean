// ============================================================
// CORPUS — durable Postgres persistence (live pg integration)
// ------------------------------------------------------------
// Proves the provenance-tracked corpus REALLY persists in Postgres (not just
// the in-memory mirror): seeds the curated + synthetic corpus through the same
// iurg-store pg path the API/cron use, then verifies with DIRECT SQL that the
// rows — including provenance + quality inside the JSONB payload — are actually
// in the `onx_iurg_object` table. Also proves the round-trip back through
// getIurgObjects() and idempotent (non-inflating) reseeding.
//
// Follows the repo's established honest pattern (see pg-adapter-integration):
//   • Runs against a LIVE Postgres in CI, where the pgvector service container
//     provides PG_TEST_URL (never skipped there).
//   • Locally, when PG_TEST_URL is absent, the whole suite is cleanly SKIPPED
//     so the deterministic keyless gate stays green without a database.
// No record-count inflation: every assertion is a MEASURED count over rows
// actually present in Postgres.
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { buildCorpusObjects, searchCorpus, summarizeCorpus, type CorpusSeed } from "../lib/corpus";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";

const PG_URL = process.env.PG_TEST_URL;
// Runs against live pg in CI; cleanly skipped locally when unset.
const suite = PG_URL ? describe : describe.skip;

const PREFIX = "corpus-";
const CLEANUP_SQL = `DELETE FROM onx_iurg_object WHERE id LIKE 'corpus-%'`;

function synthetic(contentText: string): CorpusSeed {
  return {
    contentText,
    type: "PERCEPTION",
    verification: "POSSIBLE",
    provenance: { type: "SYNTHETIC", citation: "", sourceAuthority: "" },
    sources: 1,
    trust: 0.6,
    domainTag: "MEDICINE",
  };
}

suite("corpus durable Postgres persistence (live pg)", () => {
  let store: typeof import("../lib/iurg-store");
  let pool: Pool;
  let built: ReturnType<typeof buildCorpusObjects>;
  const prevDbUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    // Switch the iurg-store to real pg mode (storeMode() reads DATABASE_URL live).
    process.env.DATABASE_URL = PG_URL;
    store = await import("../lib/iurg-store");
    pool = new Pool({ connectionString: PG_URL });
    await pool.query(CLEANUP_SQL).catch(() => {});
    built = buildCorpusObjects([
      ...CURATED_VET_CORPUS,
      synthetic("Synthetic scaffold placeholder alpha for pg durability"),
      synthetic("Synthetic scaffold placeholder beta for pg durability"),
    ]);
  });

  afterAll(async () => {
    await pool.query(CLEANUP_SQL).catch(() => {});
    await pool.end();
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
  });

  it("persists corpus rows with provenance + quality in JSONB (direct SQL proof)", async () => {
    await store.replaceIurgObjectsByIdPrefix(PREFIX, built);

    const total = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM onx_iurg_object WHERE id LIKE 'corpus-%'`,
    );
    expect(total.rows[0].n).toBe(built.length);

    // Provenance survived the JSONB round-trip in the real table.
    const authored = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM onx_iurg_object
         WHERE id LIKE 'corpus-%' AND payload->'provenance'->>'type' = 'AUTHORED'`,
    );
    expect(authored.rows[0].n).toBe(CURATED_VET_CORPUS.length);

    // Quality + content hash persisted too.
    const enriched = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM onx_iurg_object
         WHERE id LIKE 'corpus-%'
           AND (payload->>'quality') IS NOT NULL
           AND (payload->>'contentHash') IS NOT NULL`,
    );
    expect(enriched.rows[0].n).toBe(built.length);

    // eslint-disable-next-line no-console
    console.log(
      `[corpus-pg] LIVE Postgres: persisted ${total.rows[0].n} corpus rows ` +
        `(provenance-valid authored=${authored.rows[0].n}).`,
    );
  });

  it("round-trips provenance/quality back through getIurgObjects()", async () => {
    const loaded = await store.getIurgObjects();
    const corpus = loaded.filter((o) => (o.id ?? "").startsWith(PREFIX));
    const summary = summarizeCorpus(corpus);

    expect(summary.total).toBe(built.length);
    expect(summary.provenanceValidCount).toBe(CURATED_VET_CORPUS.length);
    expect(summary.avgProvenanceValidQuality).toBeGreaterThan(0);

    const valid = corpus.filter((o) => o.provenance && o.provenance.type !== "SYNTHETIC");
    const hit = searchCorpus(valid, "parvovirus", 1)[0];
    expect(hit).toBeTruthy();
    expect(hit.citation).toBeTruthy();
    expect(hit.provenanceValid).toBe(true);

    // eslint-disable-next-line no-console
    console.log(
      `[corpus-pg] LIVE cited retrieval from Postgres: "${hit.excerpt.slice(0, 72)}…" ` +
        `<- ${hit.sourceAuthority}: ${hit.citation}`,
    );
  });

  it("is idempotent — reseeding never inflates the persisted count", async () => {
    await store.replaceIurgObjectsByIdPrefix(PREFIX, built);
    await store.replaceIurgObjectsByIdPrefix(PREFIX, built);

    const total = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM onx_iurg_object WHERE id LIKE 'corpus-%'`,
    );
    expect(total.rows[0].n).toBe(built.length);
  });
});
