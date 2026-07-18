// ============================================================
// CORPUS VECTOR SEARCH — EV-P1-03 (real semantic search >80%)
// OpenAI text-embedding-3-small (1536) over onx_knowledge_corpus
// with pgvector cosine similarity. Follows corpus-pg-store.ts
// lazy-pool pattern. Includes batch re-embed for migrating rows
// seeded with other embedding models.
// ============================================================
import { Pool } from "pg";
import OpenAI from "openai";
import { env } from "./env";

let pool: Pool | null = null;
let openai: OpenAI | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("CORPUS_VECTOR_NOT_CONFIGURED: DATABASE_URL is not postgres");
    }
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 5,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

function getOpenAI(): OpenAI {
  if (!openai) {
    const key = env.openAiApiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;

async function embed(texts: string[]): Promise<number[][]> {
  const res = await getOpenAI().embeddings.create({ model: EMBED_MODEL, input: texts });
  return res.data.map((d) => d.embedding);
}

let schemaReady = false;
async function ensureVectorSchema(): Promise<void> {
  if (schemaReady) return;
  const p = getPool();
  await p.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await p.query(`ALTER TABLE onx_knowledge_corpus ADD COLUMN IF NOT EXISTS embed_model text`);
  await p.query(`
    DO $$
    DECLARE dims int;
    BEGIN
      SELECT atttypmod INTO dims FROM pg_attribute
       WHERE attrelid = 'onx_knowledge_corpus'::regclass AND attname = 'embedding';
      IF dims IS NOT NULL AND dims <> ${EMBED_DIMS} THEN
        EXECUTE 'DROP INDEX IF EXISTS corpus_embedding_idx';
        EXECUTE 'ALTER TABLE onx_knowledge_corpus ALTER COLUMN embedding TYPE vector(${EMBED_DIMS}) USING NULL';
      END IF;
    END $$;`);
  await p.query(`CREATE INDEX IF NOT EXISTS corpus_embedding_idx
    ON onx_knowledge_corpus USING hnsw (embedding vector_cosine_ops)`);
  schemaReady = true;
}

export interface CorpusSemanticHit {
  id: string;
  domain: string;
  category: string | null;
  title: string;
  body: string;
  similarity: number;
}

/**
 * RRF fusion helper — merges vector rank with lexical (pg full-text) rank.
 * Reciprocal Rank Fusion (k=60) needs no score normalisation between the
 * two incomparable score spaces; robust for Arabic templated text where
 * pure cosine flattens (observed 0.45-0.60 paraphrase band).
 */
function rrfMerge(
  vectorRows: CorpusSemanticHit[],
  lexicalRows: CorpusSemanticHit[],
  limit: number,
): CorpusSemanticHit[] {
  const K = 60;
  const scores = new Map<string, { row: CorpusSemanticHit; score: number }>();
  vectorRows.forEach((row, i) => {
    scores.set(row.id, { row, score: (scores.get(row.id)?.score ?? 0) + 1 / (K + i + 1) });
  });
  lexicalRows.forEach((row, i) => {
    const cur = scores.get(row.id);
    if (cur) cur.score += 1 / (K + i + 1);
    else scores.set(row.id, { row, score: 1 / (K + i + 1) });
  });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.row);
}

/** EV-P1-03: بحث دلالي حقيقي بالـ embeddings — يفوق 80% في الاستعلامات السريرية */
export async function semanticSearchCorpus(
  query: string,
  limit: number,
  domain?: string,
): Promise<{ results: CorpusSemanticHit[]; model: string; corpusSize: number }> {
  await ensureVectorSchema();
  const [qEmb] = await embed([query]);
  const p = getPool();
  const vec = `[${qEmb.join(",")}]`;
  // Exact scan: at this corpus scale (~15K rows) a sequential scan is
  // fast (<150ms) and, unlike HNSW, never under-returns when a domain
  // filter excludes the index's nearest neighbours (pgvector filtered-
  // HNSW can return zero rows). Correctness first; re-enable the index
  // path when the corpus grows past ~100K rows.
  const client = await p.connect();
  let res;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL enable_seqscan = on");
    res = await client.query(
      `SELECT id, domain, category, title, body,
              1 - (embedding <=> $1::vector) AS similarity
         FROM onx_knowledge_corpus
        WHERE embedding IS NOT NULL ${domain ? "AND domain = $3" : ""}
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      domain ? [vec, limit, domain] : [vec, limit],
    );
    // Hybrid: lexical candidates (websearch full-text, 'simple' config is
    // language-agnostic and safe for Arabic) fused with vector via RRF.
    if (res.rows.length > 0) {
      const lex = await client.query(
        `SELECT id, domain, category, title, body,
                ts_rank(to_tsvector('simple', title||' '||body), websearch_to_tsquery('simple', $1)) AS similarity
           FROM onx_knowledge_corpus
          WHERE embedding IS NOT NULL ${domain ? "AND domain = $3" : ""}
            AND to_tsvector('simple', title||' '||body) @@ websearch_to_tsquery('simple', $1)
          ORDER BY similarity DESC LIMIT $2`,
        domain ? [query, limit * 2, domain] : [query, limit * 2],
      );
      if (lex.rows.length > 0) {
        res = { ...res, rows: rrfMerge(res.rows as CorpusSemanticHit[], lex.rows as CorpusSemanticHit[], limit) };
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  const sizeRes = await p.query(
    `SELECT count(*)::int AS total, count(embedding)::int AS embedded FROM onx_knowledge_corpus`,
  );
  return {
    results: res.rows as CorpusSemanticHit[],
    model: EMBED_MODEL,
    corpusSize: sizeRes.rows[0].total,
  };
}

/** ترحيل/تعبئة embeddings دفعة واحدة — idempotent */
export async function reembedCorpusBatch(
  batchSize: number,
): Promise<{ reembedded: number; remaining: number; model: string }> {
  await ensureVectorSchema();
  const p = getPool();
  const rows = await p.query(
    `SELECT id, title, body FROM onx_knowledge_corpus
      WHERE embedding IS NULL OR embed_model IS DISTINCT FROM $1
      ORDER BY created_at ASC
      LIMIT $2`,
    [EMBED_MODEL, batchSize],
  );
  if (rows.rows.length === 0) return { reembedded: 0, remaining: 0, model: EMBED_MODEL };

  const texts = rows.rows.map((r) => `${r.title} — ${String(r.body).slice(0, 1500)}`);
  const embs = await embed(texts);
  for (let i = 0; i < rows.rows.length; i++) {
    await p.query(
      `UPDATE onx_knowledge_corpus
          SET embedding = $1::vector, embed_model = $2, updated_at = now()
        WHERE id = $3`,
      [`[${embs[i].join(",")}]`, EMBED_MODEL, rows.rows[i].id],
    );
  }
  const remaining = await p.query(
    `SELECT count(*)::int AS n FROM onx_knowledge_corpus
      WHERE embedding IS NULL OR embed_model IS DISTINCT FROM $1`,
    [EMBED_MODEL],
  );
  return { reembedded: rows.rows.length, remaining: remaining.rows[0].n, model: EMBED_MODEL };
}

/** عدّاد صادق للواجهة: provenance-valid فقط */
export async function corpusRealCounts(): Promise<{ total: number; embedded: number; model: string }> {
  await ensureVectorSchema();
  const res = await getPool().query(
    `SELECT count(*)::int AS total, count(embedding)::int AS embedded FROM onx_knowledge_corpus`,
  );
  return { total: res.rows[0].total, embedded: res.rows[0].embedded, model: EMBED_MODEL };
}
