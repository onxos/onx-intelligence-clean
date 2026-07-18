// ============================================================
// CORPUS CONTENT MANIFEST — STE-K-10 "Corpus honesty +
// DEMO→authentic upgrade path"
//
// A deterministic, keyless contract describing the SHIPPED corpus:
//   { version, source, docCount, domains[], provenance, disclosure,
//     templatedDocs, authenticDocs, sha256 }
//
// The sha256 is a stable CONTENT-IDENTITY hash over sorted
// (id | domain | title) lines. The seed BODY embeds per-boot random
// numbers (importance/confidence — itself a DEMO tell), so it is
// deliberately excluded: the identity hash is reproducible across
// runs while still detecting any add/remove/relabel tampering.
//
// DISCLOSURE IS MEASURED, NOT HAND-SET. Every seed record carries
// the templated marker `Source: ONX Knowledge Base v1.0`. The
// manifest counts how many docs still bear that marker:
//   all templated  → provenance TEMPLATED_SEED → disclosure DEMO
//   none templated → provenance AUTHENTIC_INGEST → disclosure REAL
//   mixed          → provenance MIXED           → disclosure DEMO
// So the disclosure flips to REAL only when the authentic archive
// (STE-REC-06) actually replaces the seed — by measurement, never by
// editing a string. Zero LLM, zero network, zero secrets (D-19).
// ============================================================
import { createHash } from "node:crypto";
import {
  collectCorpusDocs,
  onCorpusInvalidated,
  type CorpusSearchDoc,
} from "./corpus-search";

export const CORPUS_MANIFEST_VERSION = "1";

// The literal provenance marker every templated seed body ends with
// (see api/knowledge-router.ts seedKnowledge()).
export const TEMPLATED_SEED_MARKER = "Source: ONX Knowledge Base v1.0";

export type CorpusProvenance =
  | "TEMPLATED_SEED"
  | "MIXED"
  | "AUTHENTIC_INGEST"
  | "EMPTY";

export type CorpusDisclosure = "DEMO" | "REAL";

export interface CorpusContentManifest {
  version: string;
  // Human-readable label of the dominant provenance.
  source: string;
  docCount: number;
  // Sorted unique domain ids present in the corpus.
  domains: string[];
  provenance: CorpusProvenance;
  // Measured five-truth disclosure for the answer/OSVA surfaces.
  disclosure: CorpusDisclosure;
  templatedDocs: number;
  authenticDocs: number;
  // sha256 over sorted (id\0domain\0title) identity lines.
  sha256: string;
}

export interface CorpusStructureIssue {
  index: number;
  id: string;
  problem: string;
}

// Deterministic identity line — excludes the per-boot random body.
function identityLine(d: CorpusSearchDoc): string {
  return `${d.id}\u0000${d.domain}\u0000${d.title}`;
}

/** A doc is templated-seed iff its body still carries the seed marker. */
export function isTemplatedSeedDoc(d: CorpusSearchDoc): boolean {
  return d.body.includes(TEMPLATED_SEED_MARKER);
}

/** Measured provenance/disclosure from the templated-vs-authentic split. */
export function classifyProvenance(
  templatedDocs: number,
  authenticDocs: number,
): { provenance: CorpusProvenance; disclosure: CorpusDisclosure; source: string } {
  const total = templatedDocs + authenticDocs;
  if (total === 0) {
    return { provenance: "EMPTY", disclosure: "DEMO", source: "empty corpus" };
  }
  if (authenticDocs === 0) {
    return {
      provenance: "TEMPLATED_SEED",
      disclosure: "DEMO",
      source: "templated seed (ONX Knowledge Base v1.0)",
    };
  }
  if (templatedDocs === 0) {
    return {
      provenance: "AUTHENTIC_INGEST",
      disclosure: "REAL",
      source: "authentic ingested corpus",
    };
  }
  // Any surviving templated doc keeps the honest DEMO disclosure.
  return {
    provenance: "MIXED",
    disclosure: "DEMO",
    source: "mixed (templated seed + authentic ingest)",
  };
}

/** Build the deterministic content manifest for a doc set. */
export function buildCorpusContentManifest(
  docs: CorpusSearchDoc[],
): CorpusContentManifest {
  const domains = [...new Set(docs.map((d) => d.domain))].sort();
  let templatedDocs = 0;
  for (const d of docs) if (isTemplatedSeedDoc(d)) templatedDocs++;
  const authenticDocs = docs.length - templatedDocs;

  const { provenance, disclosure, source } = classifyProvenance(
    templatedDocs,
    authenticDocs,
  );

  const identityLines = docs
    .map(identityLine)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sha256 = createHash("sha256")
    .update(identityLines.join("\n"))
    .digest("hex");

  return {
    version: CORPUS_MANIFEST_VERSION,
    source,
    docCount: docs.length,
    domains,
    provenance,
    disclosure,
    templatedDocs,
    authenticDocs,
    sha256,
  };
}

/** Minimal-structure gate: every doc needs a non-empty id/domain/text. */
export function findStructureIssues(
  docs: CorpusSearchDoc[],
): CorpusStructureIssue[] {
  const issues: CorpusStructureIssue[] = [];
  docs.forEach((d, index) => {
    if (!d.id || !d.id.trim())
      issues.push({ index, id: d.id ?? "", problem: "empty id" });
    if (!d.domain || !d.domain.trim())
      issues.push({ index, id: d.id ?? "", problem: "empty domain" });
    if (!d.body || !d.body.trim())
      issues.push({ index, id: d.id ?? "", problem: "empty text/body" });
  });
  return issues;
}

// --- Cached live manifest (invalidated on any corpus mutation) ---
let cached: CorpusContentManifest | null = null;

onCorpusInvalidated(() => {
  cached = null;
});

/** Measured manifest over the live corpus; cached until next mutation. */
export async function getCorpusContentManifest(): Promise<CorpusContentManifest> {
  if (!cached) cached = buildCorpusContentManifest(await collectCorpusDocs());
  return cached;
}

/** Force a rebuild (tests / explicit refresh). */
export function invalidateCorpusManifestCache(): void {
  cached = null;
}

/** Raw docs + manifest — used by verify:corpus for structure checks. */
export async function buildLiveCorpusReport(): Promise<{
  docs: CorpusSearchDoc[];
  manifest: CorpusContentManifest;
  structureIssues: CorpusStructureIssue[];
}> {
  const docs = await collectCorpusDocs();
  return {
    docs,
    manifest: buildCorpusContentManifest(docs),
    structureIssues: findStructureIssues(docs),
  };
}
