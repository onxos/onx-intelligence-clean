// ============================================================
// CORPUS — provenance, quality, dedupe & cited retrieval
// ------------------------------------------------------------
// Honest corpus foundation (no record-count inflation):
//   - Every corpus record carries a Provenance (AUTHORED / INGESTED /
//     SYNTHETIC). SYNTHETIC scaffold is explicitly NOT provenance-valid.
//   - Identity = sha256 content hash → deterministic dedupe (reseeding is
//     idempotent, so counts never inflate across runs).
//   - qualityScore() is fully deterministic (no Math.random) and explainable.
//   - searchCorpus() returns CITED results (each hit carries its citation +
//     source authority), so retrieval is verifiable, not opaque.
//   - summarizeCorpus() reports MEASURED counts over real objects, separating
//     provenance-valid records from synthetic scaffold.
// Pure & dependency-light → fully unit-testable, no DB required.
// ============================================================
import { createHash } from "node:crypto";
import {
  VERIFICATION_VALUE,
  type IurgObjectInput,
  type IurgObjectType,
  type Provenance,
  type ProvenanceType,
  type Rank,
  type VerificationLevel,
} from "../iuc-engine";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Normalize text before hashing so trivial whitespace/case differences dedupe. */
function normalizeForHash(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable sha256 content identity — the dedupe key for a corpus record. */
export function contentHash(text: string): string {
  return createHash("sha256").update(normalizeForHash(text)).digest("hex");
}

/** Deterministic corpus id derived from content (stable across reseeds). */
export function corpusId(text: string): string {
  return `corpus-${contentHash(text).slice(0, 24)}`;
}

/**
 * A record is provenance-valid only when it has a real, checkable citation to a
 * named authority AND is not synthetic scaffold. This is the honest gate that
 * keeps procedurally generated records out of the provenance-valid count.
 */
export function isProvenanceValid(provenance?: Provenance): boolean {
  if (!provenance) return false;
  if (provenance.type === "SYNTHETIC") return false;
  return provenance.citation.trim().length > 0 && provenance.sourceAuthority.trim().length > 0;
}

export interface QualityInput {
  contentText: string;
  provenance?: Provenance;
  sources?: number;
  verification?: VerificationLevel;
  trust?: number;
}

/**
 * Deterministic quality score ∈ [0,1] (no randomness). Weighted mix of:
 *   - cited (0.30):   provenance-valid citation present
 *   - verification (0.25): UNVERIFIED..PROVEN → 0.10..1.00
 *   - corroboration (0.15): sources / 4, capped
 *   - depth (0.15):   content length / 280 chars, capped
 *   - trust (0.15):   caller trust signal
 * Weights sum to 1.0, so authored+cited+verified records score far above
 * unsourced synthetic scaffold — an honest, explainable ranking signal.
 */
export function qualityScore(input: QualityInput): number {
  const cited = isProvenanceValid(input.provenance) ? 1 : 0;
  const verification = VERIFICATION_VALUE[input.verification ?? "UNVERIFIED"] ?? 0.1;
  const corroboration = clamp01((input.sources ?? 0) / 4);
  const depth = clamp01((input.contentText?.trim().length ?? 0) / 280);
  const trust = clamp01(input.trust ?? 0);

  const score =
    0.30 * cited +
    0.25 * verification +
    0.15 * corroboration +
    0.15 * depth +
    0.15 * trust;

  return round(clamp01(score));
}

/** A single corpus seed record before it becomes an IURG object. */
export interface CorpusSeed {
  contentText: string;
  type?: IurgObjectType;
  rank?: Rank;
  verification?: VerificationLevel;
  provenance: Provenance;
  sources?: number;
  trust?: number;
  domainTag?: string;
}

function inferVerification(seed: CorpusSeed): VerificationLevel {
  if (seed.verification) return seed.verification;
  const trust = seed.trust ?? 0.6;
  if (trust >= 0.9) return "CONFIRMED";
  if (trust >= 0.75) return "PROBABLE";
  return "POSSIBLE";
}

/**
 * Map corpus seeds → IURG objects, attaching provenance + deterministic quality
 * and content-hash identity. Deduped by content hash: identical content yields
 * a single object (last write wins on metadata), so counts never inflate.
 */
export function buildCorpusObjects(seeds: CorpusSeed[]): IurgObjectInput[] {
  const byHash = new Map<string, IurgObjectInput>();

  for (const seed of seeds) {
    const contentText = seed.contentText.trim();
    if (!contentText) continue;

    const hash = contentHash(contentText);
    const verification = inferVerification(seed);
    const sources = Math.max(0, Math.round(seed.sources ?? (seed.provenance.type === "SYNTHETIC" ? 1 : 2)));
    const trust = clamp01(seed.trust ?? (isProvenanceValid(seed.provenance) ? 0.8 : 0.6));

    const quality = qualityScore({
      contentText,
      provenance: seed.provenance,
      sources,
      verification,
      trust,
    });

    byHash.set(hash, {
      id: `corpus-${hash.slice(0, 24)}`,
      type: seed.type ?? "PERCEPTION",
      rank: seed.rank ?? 1,
      verification,
      contentText,
      validated: trust >= 0.75 && isProvenanceValid(seed.provenance),
      sources,
      trust,
      provenance: seed.provenance,
      quality,
      contentHash: hash,
      domainTag: seed.domainTag,
    });
  }

  return Array.from(byHash.values());
}

export interface CorpusSummary {
  total: number;
  provenanceValidCount: number;
  authoredCount: number;
  ingestedCount: number;
  syntheticCount: number;
  avgQuality: number;
  avgProvenanceValidQuality: number;
  byType: Partial<Record<IurgObjectType, number>>;
}

/** Measured, honest rollup over real objects (no declared constants). */
export function summarizeCorpus(objects: IurgObjectInput[]): CorpusSummary {
  const byType: Partial<Record<IurgObjectType, number>> = {};
  const byProvenance: Record<ProvenanceType, number> = { AUTHORED: 0, INGESTED: 0, SYNTHETIC: 0 };
  let provenanceValidCount = 0;
  let qualitySum = 0;
  let qualityCount = 0;
  let validQualitySum = 0;

  for (const obj of objects) {
    byType[obj.type] = (byType[obj.type] ?? 0) + 1;
    if (obj.provenance) byProvenance[obj.provenance.type] = (byProvenance[obj.provenance.type] ?? 0) + 1;
    if (typeof obj.quality === "number") {
      qualitySum += obj.quality;
      qualityCount += 1;
    }
    if (isProvenanceValid(obj.provenance)) {
      provenanceValidCount += 1;
      validQualitySum += obj.quality ?? 0;
    }
  }

  return {
    total: objects.length,
    provenanceValidCount,
    authoredCount: byProvenance.AUTHORED,
    ingestedCount: byProvenance.INGESTED,
    syntheticCount: byProvenance.SYNTHETIC,
    avgQuality: qualityCount > 0 ? round(qualitySum / qualityCount) : 0,
    avgProvenanceValidQuality: provenanceValidCount > 0 ? round(validQualitySum / provenanceValidCount) : 0,
    byType,
  };
}

export interface CorpusSearchHit {
  id: string;
  type: IurgObjectType;
  excerpt: string;
  score: number;
  quality: number;
  provenanceValid: boolean;
  provenanceType: ProvenanceType | null;
  citation: string | null;
  sourceAuthority: string | null;
  domainTag: string | null;
}

function tokenize(text: string): string[] {
  return normalizeForHash(text)
    .split(/[^a-z0-9\u0600-\u06ff]+/i)
    .filter((token) => token.length > 1);
}

/**
 * Lexical retrieval that returns CITED hits. Scoring rewards phrase/term
 * overlap in content, citation and domain, then boosts by corpus quality so
 * provenance-valid records surface above synthetic scaffold. Deterministic.
 */
export function searchCorpus(
  objects: IurgObjectInput[],
  query: string,
  limit = 10,
): CorpusSearchHit[] {
  const queryText = normalizeForHash(query);
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const scored = objects.map((obj) => {
    const content = (obj.contentText ?? "").toLowerCase();
    const citation = obj.provenance?.citation?.toLowerCase() ?? "";
    const domain = (obj.domainTag ?? "").toLowerCase();
    const haystack = `${content} ${citation} ${domain}`;

    let score = 0;
    if (content.includes(queryText)) score += 40; // full phrase in content
    for (const term of terms) {
      if (content.includes(term)) score += 8;
      if (citation.includes(term)) score += 4;
      if (domain.includes(term)) score += 3;
    }
    if (score === 0) return null;

    // Quality boost (0..25): reward provenance-valid, well-verified records.
    score += (obj.quality ?? 0) * 25;
    return { obj, score: round(score, 2) };
  });

  return scored
    .filter((entry): entry is { obj: IurgObjectInput; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map(({ obj, score }) => {
      const content = obj.contentText ?? "";
      return {
        id: obj.id ?? corpusId(content),
        type: obj.type,
        excerpt: content.length > 240 ? `${content.slice(0, 240)}…` : content,
        score,
        quality: obj.quality ?? 0,
        provenanceValid: isProvenanceValid(obj.provenance),
        provenanceType: obj.provenance?.type ?? null,
        citation: obj.provenance?.citation ?? null,
        sourceAuthority: obj.provenance?.sourceAuthority ?? null,
        domainTag: obj.domainTag ?? null,
      };
    });
}
