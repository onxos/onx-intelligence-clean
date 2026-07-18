import { Pool } from "pg";
import type { ClinicAssessmentDraft } from "./clinic-assistant-engine";

export type ClinicPersistence = "POSTGRES" | "UNPERSISTED";
export type ClinicOutcome = "PENDING" | "IMPROVED" | "NOT_IMPROVED" | "REFERRED";
export const CLINIC_RETENTION_KEEP = 1000;

export interface ClinicAssessmentRecord extends ClinicAssessmentDraft {
  id: number;
  outcome: ClinicOutcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memoryAssessments: ClinicAssessmentRecord[] = [];
let memoryIdCounter = 0;

export function __resetClinicAssistantStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryAssessments.length = 0;
  memoryIdCounter = 0;
}

export function isClinicPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("CLINIC_ASSISTANT_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const p = getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS onx_clinic_assessments (
    id SERIAL PRIMARY KEY,
    species VARCHAR(64) NOT NULL,
    chief_complaint TEXT NOT NULL,
    symptoms JSONB NOT NULL,
    severity VARCHAR(16) NOT NULL,
    verdict VARCHAR(32) NOT NULL,
    rationale TEXT NOT NULL,
    evidence JSONB NOT NULL,
    authority_level VARCHAR(4) NOT NULL,
    authority_decision VARCHAR(16) NOT NULL,
    authority_reason TEXT NOT NULL,
    status VARCHAR(24) NOT NULL,
    eval_score REAL NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,
    outcome VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    outcome_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
  )`);
  schemaReady = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToRecord(r: any): ClinicAssessmentRecord {
  return {
    id: Number(r.id),
    species: r.species,
    chiefComplaint: r.chief_complaint,
    symptoms: typeof r.symptoms === "string" ? JSON.parse(r.symptoms) : r.symptoms,
    severity: r.severity,
    verdict: r.verdict,
    rationale: r.rationale,
    evidence: typeof r.evidence === "string" ? JSON.parse(r.evidence) : r.evidence,
    authorityLevel: r.authority_level,
    authorityDecision: r.authority_decision,
    authorityReason: r.authority_reason,
    status: r.status,
    evalScore: Number(r.eval_score),
    fingerprint: r.fingerprint,
    outcome: r.outcome,
    outcomeNote: r.outcome_note ?? null,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    resolvedAt: r.resolved_at
      ? r.resolved_at instanceof Date
        ? r.resolved_at.toISOString()
        : String(r.resolved_at)
      : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface RecordClinicResult {
  id: number;
  persistence: ClinicPersistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordClinicAssessment(
  draft: ClinicAssessmentDraft,
): Promise<RecordClinicResult> {
  if (isClinicPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_clinic_assessments
          (species, chief_complaint, symptoms, severity, verdict, rationale, evidence,
           authority_level, authority_decision, authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          draft.species,
          draft.chiefComplaint,
          JSON.stringify(draft.symptoms),
          draft.severity,
          draft.verdict,
          draft.rationale,
          JSON.stringify(draft.evidence),
          draft.authorityLevel,
          draft.authorityDecision,
          draft.authorityReason,
          draft.status,
          draft.evalScore,
          draft.fingerprint,
        ],
      );
      const del = await client.query(
        `DELETE FROM onx_clinic_assessments
         WHERE id <= COALESCE(
          (SELECT id FROM onx_clinic_assessments ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [CLINIC_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: CLINIC_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: ClinicAssessmentRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryAssessments.push(rec);
  let pruned = 0;
  while (memoryAssessments.length > CLINIC_RETENTION_KEEP) {
    memoryAssessments.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: CLINIC_RETENTION_KEEP,
  };
}

export interface ClinicHistoryQuery {
  species?: string;
  limit?: number;
}

export interface ClinicHistoryResult {
  persistence: ClinicPersistence;
  count: number;
  assessments: ClinicAssessmentRecord[];
  retentionKeep: number;
}

export async function getClinicAssessments(
  query: ClinicHistoryQuery = {},
): Promise<ClinicHistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(CLINIC_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isClinicPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.species
      ? await p.query(
          `SELECT * FROM onx_clinic_assessments WHERE species = $1 ORDER BY id DESC LIMIT $2`,
          [query.species, limit],
        )
      : await p.query(`SELECT * FROM onx_clinic_assessments ORDER BY id DESC LIMIT $1`, [
          limit,
        ]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      assessments: rows.rows.map(rowToRecord),
      retentionKeep: CLINIC_RETENTION_KEEP,
    };
  }
  const filtered = query.species
    ? memoryAssessments.filter((d) => d.species === query.species)
    : memoryAssessments;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    assessments: newestFirst,
    retentionKeep: CLINIC_RETENTION_KEEP,
  };
}

export interface ClinicOutcomeResult {
  found: boolean;
  persistence: ClinicPersistence;
  assessment: ClinicAssessmentRecord | null;
}

export async function recordClinicOutcome(
  id: number,
  outcome: Exclude<ClinicOutcome, "PENDING">,
  note?: string,
): Promise<ClinicOutcomeResult> {
  if (outcome !== "IMPROVED" && outcome !== "NOT_IMPROVED" && outcome !== "REFERRED") {
    throw new Error(`CLINIC_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isClinicPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_clinic_assessments
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", assessment: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_clinic_assessments WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      assessment: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memoryAssessments.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", assessment: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", assessment: rec };
}

export interface ClinicAccuracy {
  persistence: ClinicPersistence;
  species: string | null;
  total: number;
  resolved: number;
  improved: number;
  notImproved: number;
  referred: number;
  pending: number;
  accuracy: number;
}

export async function getClinicAccuracy(species?: string): Promise<ClinicAccuracy> {
  if (isClinicPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = species
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_clinic_assessments
           WHERE species = $1 GROUP BY outcome`,
          [species],
        )
      : await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_clinic_assessments GROUP BY outcome`);
    let improved = 0;
    let notImproved = 0;
    let referred = 0;
    let pending = 0;
    for (const r of rows.rows) {
      if (r.outcome === "IMPROVED") improved = Number(r.n);
      else if (r.outcome === "NOT_IMPROVED") notImproved = Number(r.n);
      else if (r.outcome === "REFERRED") referred = Number(r.n);
      else if (r.outcome === "PENDING") pending = Number(r.n);
    }
    const resolved = improved + notImproved + referred;
    return {
      persistence: "POSTGRES",
      species: species ?? null,
      total: resolved + pending,
      resolved,
      improved,
      notImproved,
      referred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((improved / resolved) * 10000) / 10000,
    };
  }
  const scope = species ? memoryAssessments.filter((d) => d.species === species) : memoryAssessments;
  const improved = scope.filter((d) => d.outcome === "IMPROVED").length;
  const notImproved = scope.filter((d) => d.outcome === "NOT_IMPROVED").length;
  const referred = scope.filter((d) => d.outcome === "REFERRED").length;
  const pending = scope.filter((d) => d.outcome === "PENDING").length;
  const resolved = improved + notImproved + referred;
  return {
    persistence: "UNPERSISTED",
    species: species ?? null,
    total: scope.length,
    resolved,
    improved,
    notImproved,
    referred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((improved / resolved) * 10000) / 10000,
  };
}

