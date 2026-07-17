// ============================================================
// CORPUS PROVENANCE EXPORT — deterministic, audit-grade manifest
// ------------------------------------------------------------
// Emit a MEASURED, deterministic manifest of the corpus so every record is
// independently verifiable and re-ingestible WITHOUT inflation:
//   • one digest per record — id, content hash (identity), provenance type,
//     citation, source authority, quality, domain, content length — sorted by
//     id so the output is byte-stable for a given corpus.
//   • a single manifestHash (sha256 over the canonical digest list) that acts
//     as the audit anchor: the same corpus always yields the same hash, and any
//     added / dropped / mutated record changes it.
//   • measured counts (total, provenance-valid, by provenance type).
//
// verifyManifest() re-derives the manifest from the live objects and reports
// exact mismatches (missing / extra / changed / content-hash-drift), so a
// stored manifest can be checked against the running corpus to detect silent
// drift or tampering. Read-only; no content is trusted from the manifest — the
// content hash is always recomputed from the live record.
// ============================================================
import { createHash } from "node:crypto";
import type { IurgObjectInput, IurgObjectType, ProvenanceType } from "../iuc-engine";
import { contentHash as hashContent, corpusId, isProvenanceValid } from "./corpus";

export const CORPUS_MANIFEST_VERSION = "1";

export interface RecordDigest {
  id: string;
  contentHash: string;
  type: IurgObjectType;
  provenanceType: ProvenanceType | null;
  provenanceValid: boolean;
  citation: string | null;
  sourceAuthority: string | null;
  quality: number;
  domainTag: string | null;
  contentLength: number;
}

export interface CorpusManifest {
  version: string;
  /** Informational only — NOT part of manifestHash, so the hash stays stable. */
  generatedAt: string;
  total: number;
  provenanceValidCount: number;
  countByProvenance: Record<ProvenanceType, number>;
  /** sha256 over the canonical, id-sorted digest list. Deterministic anchor. */
  manifestHash: string;
  records: RecordDigest[];
}

export type MismatchKind =
  | "MISSING_IN_CORPUS"
  | "EXTRA_IN_CORPUS"
  | "CONTENT_HASH_DRIFT"
  | "METADATA_CHANGED";

export interface ManifestMismatch {
  id: string;
  kind: MismatchKind;
  detail: string;
}

export interface ManifestVerification {
  valid: boolean;
  expectedHash: string;
  actualHash: string;
  recordCount: number;
  mismatches: ManifestMismatch[];
}

function resolveId(obj: IurgObjectInput): string {
  return obj.id ?? corpusId((obj.contentText ?? "").trim());
}

function digestOf(obj: IurgObjectInput): RecordDigest {
  const content = obj.contentText ?? "";
  // Identity is ALWAYS recomputed from live content — never trusted blindly.
  const ch = obj.contentHash ?? hashContent(content);
  return {
    id: resolveId(obj),
    contentHash: ch,
    type: obj.type,
    provenanceType: obj.provenance?.type ?? null,
    provenanceValid: isProvenanceValid(obj.provenance),
    citation: obj.provenance?.citation ?? null,
    sourceAuthority: obj.provenance?.sourceAuthority ?? null,
    quality: typeof obj.quality === "number" ? obj.quality : 0,
    domainTag: obj.domainTag ?? null,
    contentLength: content.trim().length,
  };
}

/** Canonical, order-independent string for one digest (used for hashing). */
function canonicalLine(d: RecordDigest): string {
  return [
    d.id,
    d.contentHash,
    d.type,
    d.provenanceType ?? "",
    d.provenanceValid ? "1" : "0",
    d.citation ?? "",
    d.sourceAuthority ?? "",
    d.quality,
    d.domainTag ?? "",
    d.contentLength,
  ].join("|");
}

function hashDigests(sorted: RecordDigest[]): string {
  const canonical = sorted.map(canonicalLine).join("\n");
  return createHash("sha256").update(`${CORPUS_MANIFEST_VERSION}\n${canonical}`).digest("hex");
}

/**
 * Build a deterministic, audit-grade manifest of the corpus. Records are sorted
 * by id; manifestHash is stable for a given corpus (independent of input order).
 */
export function exportCorpusManifest(objects: IurgObjectInput[]): CorpusManifest {
  const records = objects.map(digestOf).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const countByProvenance: Record<ProvenanceType, number> = { AUTHORED: 0, INGESTED: 0, SYNTHETIC: 0 };
  let provenanceValidCount = 0;
  for (const r of records) {
    if (r.provenanceType) countByProvenance[r.provenanceType] += 1;
    if (r.provenanceValid) provenanceValidCount += 1;
  }

  return {
    version: CORPUS_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    total: records.length,
    provenanceValidCount,
    countByProvenance,
    manifestHash: hashDigests(records),
    records,
  };
}

/**
 * Verify a previously-exported manifest against the live corpus. Re-derives all
 * hashes from the live objects (never trusts the manifest's content) and reports
 * every mismatch. valid === true only when the manifest hash matches AND there
 * are zero per-record mismatches.
 */
export function verifyManifest(
  objects: IurgObjectInput[],
  manifest: CorpusManifest,
): ManifestVerification {
  const live = exportCorpusManifest(objects);
  const liveById = new Map(live.records.map((r) => [r.id, r]));
  const manifestById = new Map(manifest.records.map((r) => [r.id, r]));
  const mismatches: ManifestMismatch[] = [];

  for (const [id, m] of manifestById) {
    const l = liveById.get(id);
    if (!l) {
      mismatches.push({ id, kind: "MISSING_IN_CORPUS", detail: "record in manifest is absent from the live corpus" });
      continue;
    }
    if (l.contentHash !== m.contentHash) {
      mismatches.push({ id, kind: "CONTENT_HASH_DRIFT", detail: `content hash ${m.contentHash.slice(0, 12)}… → ${l.contentHash.slice(0, 12)}…` });
    } else if (canonicalLine(l) !== canonicalLine(m)) {
      mismatches.push({ id, kind: "METADATA_CHANGED", detail: "provenance/quality/domain metadata differs from the manifest" });
    }
  }
  for (const id of liveById.keys()) {
    if (!manifestById.has(id)) {
      mismatches.push({ id, kind: "EXTRA_IN_CORPUS", detail: "record in the live corpus is absent from the manifest" });
    }
  }

  mismatches.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.kind < b.kind ? -1 : 1));

  return {
    valid: live.manifestHash === manifest.manifestHash && mismatches.length === 0,
    expectedHash: manifest.manifestHash,
    actualHash: live.manifestHash,
    recordCount: live.total,
    mismatches,
  };
}
