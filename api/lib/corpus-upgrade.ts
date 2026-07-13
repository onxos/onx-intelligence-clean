// ============================================================
// CORPUS UPGRADE PATH — STE-K-16 "DEMO→REAL by measurement"
//
// Turns the K-10 operator runbook into WORKING, TESTED code. The
// system never claims REAL; it MEASURES it. This module is the pure,
// deterministic core (zero LLM, zero network, zero secrets — D-19)
// that both the operator script (scripts/ingest-corpus.ts) and the
// bridge ingest path rely on to:
//   1. validate authentic documents (structure + real provenance),
//   2. tag them non-templated by construction (per-doc `source`
//      preserved in the body, never the seed marker),
//   3. MEASURE the disclosure flip DEMO→MIXED→REAL via the exact
//      same manifest logic the verify:corpus gate pins.
//
// The disclosure flips by measurement alone: a single surviving
// templated seed keeps the honest DEMO/MIXED label (conservative,
// mirrors D-19). It reaches REAL only when zero templated docs remain.
// ============================================================
import {
  buildCorpusContentManifest,
  isTemplatedSeedDoc,
  TEMPLATED_SEED_MARKER,
  type CorpusContentManifest,
} from "./corpus-manifest";
import type { CorpusSearchDoc } from "./corpus-search";

// An authentic document supplied by the operator/recovery archive.
// `source` is the per-document provenance (e.g. "WHO Guidelines 2024")
// and MUST be real — never the templated seed marker.
export interface AuthenticDocInput {
  id?: string;
  domain: string;
  title: string;
  body: string;
  source: string;
}

export interface AuthenticValidationIssue {
  index: number;
  id: string;
  problem: string;
}

/**
 * Validate authentic docs before ingest. Beyond the minimal-structure
 * gate (non-empty id/domain/title/body), the `source` must be present
 * and NOT the templated seed marker, and the body must not embed that
 * marker — otherwise the doc would be honestly miscounted as DEMO.
 */
export function validateAuthenticDocs(
  docs: AuthenticDocInput[],
): AuthenticValidationIssue[] {
  const issues: AuthenticValidationIssue[] = [];
  docs.forEach((d, index) => {
    const id = d.id?.trim() || `auth_${index}`;
    if (!d.domain || !d.domain.trim())
      issues.push({ index, id, problem: "empty domain" });
    if (!d.title || !d.title.trim())
      issues.push({ index, id, problem: "empty title" });
    if (!d.body || !d.body.trim())
      issues.push({ index, id, problem: "empty body" });
    if (!d.source || !d.source.trim()) {
      issues.push({ index, id, problem: "empty source (provenance required)" });
    } else if (d.source.trim() === TEMPLATED_SEED_MARKER) {
      issues.push({
        index,
        id,
        problem: "source equals templated seed marker (would be miscounted DEMO)",
      });
    }
    if (d.body && d.body.includes(TEMPLATED_SEED_MARKER))
      issues.push({
        index,
        id,
        problem: "body embeds the templated seed marker (would be counted DEMO)",
      });
  });
  return issues;
}

/**
 * Convert authentic inputs into search docs, tagged non-templated by
 * construction. The per-doc provenance is preserved as a trailing
 * `Source: <source>` line (guaranteed different from the seed marker
 * by validateAuthenticDocs), so the manifest measures each unit as
 * authentic. Only appends the line when the body does not already
 * end with a Source: attribution.
 */
export function toAuthenticSearchDocs(
  docs: AuthenticDocInput[],
): CorpusSearchDoc[] {
  return docs.map((d, i) => {
    const trimmed = d.body.trimEnd();
    const hasSourceLine = /\n\s*Source:\s/i.test(`\n${trimmed}`);
    const body = hasSourceLine ? trimmed : `${trimmed}\nSource: ${d.source}`;
    return {
      id: d.id?.trim() || `auth_${i}`,
      domain: d.domain,
      title: d.title,
      body,
    };
  });
}

export interface UpgradePreview {
  before: CorpusContentManifest;
  after: CorpusContentManifest;
  // disclosure changed between before and after
  flipped: boolean;
  // after.disclosure === "REAL"
  reachedReal: boolean;
  addedAuthentic: number;
  remainingTemplated: number;
  // the sha256 identity changed (a legitimate, intended new baseline)
  shaChanged: boolean;
}

/**
 * Pure, deterministic preview of ingesting `authentic` docs into an
 * existing `current` corpus. Reports the MEASURED disclosure flip and
 * whether the content-identity sha256 changed (a legitimate new
 * baseline that the operator must re-pin via `verify:corpus --write`).
 */
export function previewUpgrade(
  current: CorpusSearchDoc[],
  authentic: AuthenticDocInput[],
): UpgradePreview {
  const before = buildCorpusContentManifest(current);
  const merged = [...current, ...toAuthenticSearchDocs(authentic)];
  const after = buildCorpusContentManifest(merged);
  return {
    before,
    after,
    flipped: before.disclosure !== after.disclosure,
    reachedReal: after.disclosure === "REAL",
    addedAuthentic: authentic.length,
    remainingTemplated: after.templatedDocs,
    shaChanged: before.sha256 !== after.sha256,
  };
}

/** Re-export for callers that measure a standalone authentic set. */
export { buildCorpusContentManifest, isTemplatedSeedDoc };
