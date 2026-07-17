// ============================================================
// CORPUS QUALITY AUDIT — measured distribution + per-record flags
// ------------------------------------------------------------
// A MEASURED, deterministic quality report over the persisted corpus. Unlike
// summarizeCorpus (aggregate rollup), this exposes:
//   • a quality histogram in fixed [0,1] bands (measured counts per band),
//   • average quality broken down by provenance type,
//   • per-record quality flags computed from real fields:
//       BELOW_THRESHOLD   quality < minQuality
//       MISSING_CITATION  not a provenance-valid cited record
//       MISSING_DOMAIN    no domainTag
//       SHORT_CONTENT     contentText shorter than minContentChars
//       SYNTHETIC_SCAFFOLD  provenance.type === "SYNTHETIC"
//   • measured flag counts + the flagged records (bounded, deterministic).
//
// No inflation and no mutation: every number counts records actually present;
// the audit only reads. Provenance-valid authored records are the quality core;
// the flags surface exactly where the corpus is weak so it can be improved
// honestly (not hidden).
// ============================================================
import type { IurgObjectInput, ProvenanceType } from "../iuc-engine";
import { corpusId, isProvenanceValid } from "./corpus";

export type QualityFlag =
  | "BELOW_THRESHOLD"
  | "MISSING_CITATION"
  | "MISSING_DOMAIN"
  | "SHORT_CONTENT"
  | "SYNTHETIC_SCAFFOLD";

export interface QualityBand {
  /** Inclusive lower bound of the band. */
  from: number;
  /** Exclusive upper bound (the top band is inclusive of 1.0). */
  to: number;
  count: number;
}

export interface FlaggedRecord {
  id: string;
  quality: number;
  provenanceType: ProvenanceType | null;
  flags: QualityFlag[];
}

export interface CorpusQualityAudit {
  total: number;
  minQuality: number;
  minContentChars: number;
  avgQuality: number;
  /** Quality histogram in 5 fixed bands over [0,1] (measured counts). */
  histogram: QualityBand[];
  /** Average quality per provenance type (0 when none of that type). */
  avgQualityByProvenance: Record<ProvenanceType, number>;
  countByProvenance: Record<ProvenanceType, number>;
  /** Measured count of records carrying each flag. */
  flagCounts: Record<QualityFlag, number>;
  /** Records with >= 1 flag (deterministically ordered, bounded by `limit`). */
  flagged: FlaggedRecord[];
  flaggedCount: number;
  cleanCount: number;
}

export interface AuditOptions {
  minQuality?: number;
  minContentChars?: number;
  /** Max flagged records to enumerate (measured counts are always complete). */
  limit?: number;
}

const BAND_EDGES = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function recordId(obj: IurgObjectInput): string {
  return obj.id ?? corpusId((obj.contentText ?? "").trim());
}

function recordFlags(
  obj: IurgObjectInput,
  quality: number,
  minQuality: number,
  minContentChars: number,
): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (quality < minQuality) flags.push("BELOW_THRESHOLD");
  if (!isProvenanceValid(obj.provenance)) flags.push("MISSING_CITATION");
  if (!(obj.domainTag ?? "").trim()) flags.push("MISSING_DOMAIN");
  if ((obj.contentText ?? "").trim().length < minContentChars) flags.push("SHORT_CONTENT");
  if (obj.provenance?.type === "SYNTHETIC") flags.push("SYNTHETIC_SCAFFOLD");
  return flags;
}

/**
 * Produce a measured, deterministic quality audit of the corpus. Read-only.
 */
export function auditCorpus(
  objects: IurgObjectInput[],
  opts: AuditOptions = {},
): CorpusQualityAudit {
  const minQuality = opts.minQuality ?? 0.5;
  const minContentChars = opts.minContentChars ?? 80;
  const limit = Math.max(1, opts.limit ?? 50);

  const histogram: QualityBand[] = [];
  for (let i = 0; i < BAND_EDGES.length - 1; i++) {
    histogram.push({ from: BAND_EDGES[i], to: BAND_EDGES[i + 1], count: 0 });
  }

  const provTypes: ProvenanceType[] = ["AUTHORED", "INGESTED", "SYNTHETIC"];
  const sumByProvenance: Record<ProvenanceType, number> = { AUTHORED: 0, INGESTED: 0, SYNTHETIC: 0 };
  const countByProvenance: Record<ProvenanceType, number> = { AUTHORED: 0, INGESTED: 0, SYNTHETIC: 0 };
  const flagCounts: Record<QualityFlag, number> = {
    BELOW_THRESHOLD: 0,
    MISSING_CITATION: 0,
    MISSING_DOMAIN: 0,
    SHORT_CONTENT: 0,
    SYNTHETIC_SCAFFOLD: 0,
  };

  let qualitySum = 0;
  let flaggedCount = 0;
  const flaggedAll: FlaggedRecord[] = [];

  for (const obj of objects) {
    const quality = typeof obj.quality === "number" ? obj.quality : 0;
    qualitySum += quality;

    // Histogram: top band is inclusive of 1.0.
    let band = 0;
    for (let i = 0; i < histogram.length; i++) {
      if (quality >= histogram[i].from && (quality < histogram[i].to || (i === histogram.length - 1 && quality <= histogram[i].to))) {
        band = i;
        break;
      }
    }
    histogram[band].count += 1;

    const pType = obj.provenance?.type;
    if (pType && provTypes.includes(pType)) {
      sumByProvenance[pType] += quality;
      countByProvenance[pType] += 1;
    }

    const flags = recordFlags(obj, quality, minQuality, minContentChars);
    if (flags.length > 0) {
      flaggedCount += 1;
      for (const f of flags) flagCounts[f] += 1;
      flaggedAll.push({
        id: recordId(obj),
        quality: round(quality),
        provenanceType: pType ?? null,
        flags,
      });
    }
  }

  // Deterministic order: worst quality first, then most flags, then id.
  flaggedAll.sort(
    (a, b) => a.quality - b.quality || b.flags.length - a.flags.length || (a.id < b.id ? -1 : 1),
  );

  const avgQualityByProvenance: Record<ProvenanceType, number> = { AUTHORED: 0, INGESTED: 0, SYNTHETIC: 0 };
  for (const t of provTypes) {
    avgQualityByProvenance[t] = countByProvenance[t] > 0 ? round(sumByProvenance[t] / countByProvenance[t]) : 0;
  }

  return {
    total: objects.length,
    minQuality,
    minContentChars,
    avgQuality: objects.length > 0 ? round(qualitySum / objects.length) : 0,
    histogram,
    avgQualityByProvenance,
    countByProvenance,
    flagCounts,
    flagged: flaggedAll.slice(0, limit),
    flaggedCount,
    cleanCount: objects.length - flaggedCount,
  };
}
