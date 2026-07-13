// ============================================================
// PERSISTENT MEMORY — swappable MemoryStore (B4)
//
// A durable memory abstraction for intelligence objects and the
// insights they reason over. One interface, two implementations:
//
//   • InMemoryMemoryStore — deterministic, no keys, no DB. The
//     default used by CI and the reasoning runtime.
//   • PgVectorMemoryStore — a pgvector/Postgres adapter behind the
//     SAME interface. Every write is best-effort mirrored to pg; all
//     reads/searches are served from a deterministic in-memory mirror
//     so a missing/dead database degrades to the exact in-memory
//     behaviour and NEVER throws (fail-safe, no keys required).
//
// Every record carries provenance (source, method, recordedAt,
// confidence). The store supports correction (supersede), intentional
// forgetting (tagged soft-delete), and full export for audit. Vector
// similarity uses a deterministic hash embedding — reproducible in CI
// without any model or key.
//
// Honest naming: this is a storage layer, not a mind.
// ============================================================
import { newCorrelationId, recordPgFailure, recordPgSuccess } from "./pg-diagnostics";

export interface Provenance {
  /** Where the memory came from (e.g. "reflection-cycle", "founder"). */
  source: string;
  /** How it was produced (e.g. "deterministic", "manual", "ingest"). */
  method: string;
  /** ISO-8601 timestamp supplied by the caller (deterministic in tests). */
  recordedAt: string;
  /** Caller confidence in the memory, in [0,1]. */
  confidence: number;
}

export interface MemoryInput {
  id: string;
  /** Category, e.g. "intelligence-object" | "insight" | "note". */
  kind: string;
  content: string;
  provenance: Provenance;
}

export interface MemoryRecord {
  id: string;
  kind: string;
  content: string;
  embedding: number[];
  provenance: Provenance;
  /** True once a newer record has superseded this one. */
  corrected: boolean;
  /** Id of the record this one corrects (set on the corrected copy). */
  supersedes?: string;
  /** True when intentionally forgotten (tagged soft-delete). */
  forgotten: boolean;
  forgottenReason?: string;
  /** Monotonic insertion order — deterministic sort key. */
  seq: number;
}

export interface MemoryQuery {
  text: string;
  kind?: string;
  limit?: number;
  /** Include intentionally-forgotten records in the result. Default false. */
  includeForgotten?: boolean;
}

export interface ScoredRecord {
  record: MemoryRecord;
  similarity: number;
}

export interface MemoryExport {
  records: MemoryRecord[];
  count: number;
  forgottenCount: number;
}

export interface MemoryStore {
  put(input: MemoryInput): Promise<MemoryRecord>;
  get(id: string, includeForgotten?: boolean): Promise<MemoryRecord | null>;
  /** Supersede an existing record with corrected content; returns the new record. */
  correct(id: string, patch: { content: string; provenance: Provenance; newId?: string }): Promise<MemoryRecord>;
  /** Intentionally forget a record (tagged soft-delete). Idempotent. */
  forget(id: string, reason: string): Promise<MemoryRecord>;
  /** Similarity search, newest-relevant first. Excludes corrected & forgotten by default. */
  search(query: MemoryQuery): Promise<ScoredRecord[]>;
  /** Full audit export — includes corrected and forgotten records, sorted by seq. */
  export(): Promise<MemoryExport>;
  list(kind?: string): Promise<MemoryRecord[]>;
}

/** Raised for malformed memory input — fail-closed. */
export class MemoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "MemoryError";
    this.code = code;
  }
}

export const EMBEDDING_DIM = 32;

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MemoryError("EMPTY_FIELD", `الحقل «${field}» مطلوب.`);
  }
  return value;
}

function validateProvenance(p: Provenance | undefined): Provenance {
  if (!p || typeof p !== "object") {
    throw new MemoryError("NO_PROVENANCE", "كل إدخال ذاكرة يتطلب provenance.");
  }
  requireText(p.source, "provenance.source");
  requireText(p.method, "provenance.method");
  requireText(p.recordedAt, "provenance.recordedAt");
  if (typeof p.confidence !== "number" || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1) {
    throw new MemoryError("BAD_CONFIDENCE", "provenance.confidence يجب أن يكون في المدى [0,1].");
  }
  if (Number.isNaN(Date.parse(p.recordedAt))) {
    throw new MemoryError("BAD_TIMESTAMP", "provenance.recordedAt يجب أن يكون تاريخاً ISO صالحاً.");
  }
  return { source: p.source, method: p.method, recordedAt: p.recordedAt, confidence: p.confidence };
}

/**
 * Deterministic hash embedding (FNV-1a → signed bucket) with L2
 * normalisation. Same text ⇒ same vector, always — no model, no key.
 */
export function deterministicEmbedding(text: string, dim = EMBEDDING_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = text.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const tok of tokens) {
    let h = 0x811c9dc5;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    const bucket = h % dim;
    const sign = (h >>> 16) & 1 ? 1 : -1;
    vec[bucket] += sign;
  }
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (mag === 0) return vec;
  return vec.map((v) => Number((v / mag).toFixed(6)));
}

/** Cosine similarity of two equal-length vectors, in [-1,1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma += a[i] * a[i];
    mb += b[i] * b[i];
  }
  if (ma === 0 || mb === 0) return 0;
  return Number((dot / (Math.sqrt(ma) * Math.sqrt(mb))).toFixed(6));
}

// ── In-memory deterministic implementation ─────────────────────────
export class InMemoryMemoryStore implements MemoryStore {
  private records = new Map<string, MemoryRecord>();
  private seqCounter = 0;

  async put(input: MemoryInput): Promise<MemoryRecord> {
    requireText(input?.id, "id");
    requireText(input?.kind, "kind");
    requireText(input?.content, "content");
    const provenance = validateProvenance(input?.provenance);
    if (this.records.has(input.id)) {
      throw new MemoryError("DUPLICATE", `المعرّف «${input.id}» موجود مسبقاً؛ استخدم correct للتصحيح.`);
    }
    const record: MemoryRecord = {
      id: input.id,
      kind: input.kind,
      content: input.content,
      embedding: deterministicEmbedding(input.content),
      provenance,
      corrected: false,
      forgotten: false,
      seq: ++this.seqCounter,
    };
    this.records.set(record.id, record);
    return { ...record };
  }

  async get(id: string, includeForgotten = false): Promise<MemoryRecord | null> {
    const record = this.records.get(id);
    if (!record) return null;
    if (record.forgotten && !includeForgotten) return null;
    return { ...record };
  }

  async correct(id: string, patch: { content: string; provenance: Provenance; newId?: string }): Promise<MemoryRecord> {
    const old = this.records.get(id);
    if (!old) throw new MemoryError("NOT_FOUND", `لا يوجد سجل «${id}» لتصحيحه.`);
    if (old.forgotten) throw new MemoryError("FORGOTTEN", `السجل «${id}» منسيّ ولا يُصحَّح.`);
    requireText(patch?.content, "content");
    const provenance = validateProvenance(patch?.provenance);
    const newId = patch.newId ?? `${id}~v${this.seqCounter + 1}`;
    if (this.records.has(newId)) {
      throw new MemoryError("DUPLICATE", `المعرّف الجديد «${newId}» موجود مسبقاً.`);
    }
    old.corrected = true;
    const record: MemoryRecord = {
      id: newId,
      kind: old.kind,
      content: patch.content,
      embedding: deterministicEmbedding(patch.content),
      provenance,
      corrected: false,
      supersedes: id,
      forgotten: false,
      seq: ++this.seqCounter,
    };
    this.records.set(record.id, record);
    return { ...record };
  }

  async forget(id: string, reason: string): Promise<MemoryRecord> {
    const record = this.records.get(id);
    if (!record) throw new MemoryError("NOT_FOUND", `لا يوجد سجل «${id}» لنسيانه.`);
    requireText(reason, "reason");
    record.forgotten = true;
    record.forgottenReason = reason;
    return { ...record };
  }

  async search(query: MemoryQuery): Promise<ScoredRecord[]> {
    requireText(query?.text, "text");
    const includeForgotten = query.includeForgotten === true;
    const limit = clampLimit(query.limit);
    const qVec = deterministicEmbedding(query.text);
    const scored: ScoredRecord[] = [];
    for (const record of this.records.values()) {
      if (record.corrected) continue;
      if (record.forgotten && !includeForgotten) continue;
      if (query.kind && record.kind !== query.kind) continue;
      scored.push({ record: { ...record }, similarity: cosineSimilarity(qVec, record.embedding) });
    }
    // Deterministic order: similarity desc, then newest (seq desc), then id.
    scored.sort((a, b) =>
      b.similarity - a.similarity ||
      b.record.seq - a.record.seq ||
      (a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0),
    );
    return scored.slice(0, limit);
  }

  async export(): Promise<MemoryExport> {
    const records = [...this.records.values()]
      .map((r) => ({ ...r }))
      .sort((a, b) => a.seq - b.seq);
    return {
      records,
      count: records.length,
      forgottenCount: records.filter((r) => r.forgotten).length,
    };
  }

  async list(kind?: string): Promise<MemoryRecord[]> {
    return [...this.records.values()]
      .filter((r) => (kind ? r.kind === kind : true))
      .map((r) => ({ ...r }))
      .sort((a, b) => a.seq - b.seq);
  }
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);
}

// ── pgvector adapter (same interface, deterministic fallback) ───────
/** Minimal pg query seam so the adapter can run against a mock in CI. */
export type PgQuery = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

export interface PgVectorOptions {
  connectionString?: string | undefined;
  /** Injectable query fn (tests/mock). When omitted a real pool is lazily created. */
  query?: PgQuery;
  table?: string;
}

export interface PgVectorStatus {
  mode: "pg" | "memory";
  pgWrites: number;
  pgErrors: number;
}

/** Serialise an embedding as a pgvector literal: [a,b,c]. */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * pgvector-backed store. Reads/searches are served from a deterministic
 * in-memory mirror; writes are additionally best-effort persisted to
 * Postgres. Any pg failure is absorbed (counter bumped) and the mirror
 * keeps the store fully functional — fail-safe, never throws on pg.
 */
export class PgVectorMemoryStore implements MemoryStore {
  private mirror = new InMemoryMemoryStore();
  private table: string;
  private queryFn: PgQuery | null;
  private hasPg: boolean;
  private status: PgVectorStatus;

  constructor(opts: PgVectorOptions = {}) {
    this.table = opts.table ?? "onx_memory_record";
    this.hasPg = Boolean(opts.query || opts.connectionString);
    this.queryFn = opts.query ?? null;
    this.status = { mode: this.hasPg ? "pg" : "memory", pgWrites: 0, pgErrors: 0 };
  }

  getStatus(): PgVectorStatus {
    return { ...this.status };
  }

  private async persist(record: MemoryRecord): Promise<void> {
    if (!this.hasPg) return;
    try {
      const q = this.queryFn ?? (await this.resolvePool());
      if (!q) return;
      await q(
        `INSERT INTO ${this.table} (id, kind, content, embedding, provenance, corrected, supersedes, forgotten, forgotten_reason, seq)
         VALUES ($1,$2,$3,$4::vector,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           content = EXCLUDED.content, embedding = EXCLUDED.embedding, provenance = EXCLUDED.provenance,
           corrected = EXCLUDED.corrected, forgotten = EXCLUDED.forgotten, forgotten_reason = EXCLUDED.forgotten_reason`,
        [
          record.id,
          record.kind,
          record.content,
          toPgVector(record.embedding),
          JSON.stringify(record.provenance),
          record.corrected,
          record.supersedes ?? null,
          record.forgotten,
          record.forgottenReason ?? null,
          record.seq,
        ],
      );
      this.status.pgWrites += 1;
      recordPgSuccess("memory.persist");
    } catch (error) {
      // Fail-safe: a dead/absent database never breaks the store — the
      // deterministic mirror already holds the authoritative copy. But the
      // failure is no longer silent: it is recorded loudly (structured log +
      // correlation id + global diagnostics) so it is observable.
      this.status.pgErrors += 1;
      recordPgFailure("memory.persist", error, { correlationId: newCorrelationId() });
    }
  }

  private async resolvePool(): Promise<PgQuery | null> {
    // Real pool creation is intentionally lazy and best-effort; when the
    // pg driver or connection is unavailable we degrade to the mirror.
    try {
      const cs = process.env.DATABASE_URL;
      if (!cs) return null;
      const mod = (await import("pg")) as { Pool: new (c: { connectionString: string }) => { query: PgQuery } };
      const pool = new mod.Pool({ connectionString: cs });
      this.queryFn = (text, params) => pool.query(text, params);
      return this.queryFn;
    } catch (error) {
      // Best-effort pool creation: record the failure loudly, then degrade
      // to the deterministic mirror instead of swallowing it silently.
      recordPgFailure("memory.resolvePool", error, { correlationId: newCorrelationId() });
      return null;
    }
  }

  async put(input: MemoryInput): Promise<MemoryRecord> {
    const record = await this.mirror.put(input);
    await this.persist(record);
    return record;
  }

  async get(id: string, includeForgotten?: boolean): Promise<MemoryRecord | null> {
    return this.mirror.get(id, includeForgotten);
  }

  async correct(id: string, patch: { content: string; provenance: Provenance; newId?: string }): Promise<MemoryRecord> {
    const record = await this.mirror.correct(id, patch);
    await this.persist(record);
    const old = await this.mirror.get(id, true);
    if (old) await this.persist(old);
    return record;
  }

  async forget(id: string, reason: string): Promise<MemoryRecord> {
    const record = await this.mirror.forget(id, reason);
    await this.persist(record);
    return record;
  }

  async search(query: MemoryQuery): Promise<ScoredRecord[]> {
    return this.mirror.search(query);
  }

  async export(): Promise<MemoryExport> {
    return this.mirror.export();
  }

  async list(kind?: string): Promise<MemoryRecord[]> {
    return this.mirror.list(kind);
  }
}

/**
 * Factory: returns the pgvector adapter when a Postgres connection is
 * configured, otherwise the deterministic in-memory store. Default is
 * always the keyless deterministic implementation.
 */
export function createMemoryStore(opts: { connectionString?: string | undefined } = {}): MemoryStore {
  const cs = opts.connectionString ?? process.env.DATABASE_URL;
  if (cs) return new PgVectorMemoryStore({ connectionString: cs });
  return new InMemoryMemoryStore();
}
