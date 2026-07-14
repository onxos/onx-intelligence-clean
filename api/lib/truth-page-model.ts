// ============================================================
// STE-K-17 — Truth page view-model (PURE, deterministic, testable).
//
// The public human-readable truth page (src/pages/Truth.tsx) is a THIN
// renderer over this pure builder. All values come from the live honest
// surfaces (onx.selfVerify, corpusQuery.manifest, providers.status) —
// ZERO hard-coded truth. Each source arrives as a discriminated
// SourceOutcome so a FETCH FAILURE is a distinct, named, fail-honest
// state (never silently blended with an empty/populated success).
//
// Section states:
//   OK           — the surface answered and carries data.
//   EMPTY        — the surface answered but the resource is honestly
//                  empty (e.g. an unpopulated truth ledger, state:EMPTY).
//   FETCH_FAILED — the surface could not be read (network/parse); the
//                  page shows an explicit failure, not a fake zero.
//
// Keeping the logic here (node-tested in the existing api/** gate) is
// the honest minimal choice: the SPA test harness is node-only, so the
// deterministic "render" tests inject data into THIS builder — the exact
// state the component paints — rather than pulling in a heavy DOM stack.
// ============================================================
import type { SelfVerificationReport } from "./self-verify";
import type { TruthLedgerSummary } from "./truth-ledger";
import type { CorpusContentManifest } from "./corpus-manifest";
import type { RateLimitDisclosure } from "./rate-limiter";

export type SourceOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

export type SectionState = "OK" | "EMPTY" | "FETCH_FAILED";

// onx.selfVerify returns the report PLUS the router-composed ledger summary.
export type SelfVerifyData = SelfVerificationReport & {
  truthLedgerSummary: TruthLedgerSummary;
};

// corpusQuery.manifest returns the measured content manifest (+ envelope).
export type CorpusManifestData = CorpusContentManifest;

// providers.status carries the rate-limit disclosure on every public read.
export type ProvidersStatusData = {
  rateLimit: RateLimitDisclosure;
  providers?: Array<{ id: string; status: string }>;
};

export interface TruthPageSources {
  selfVerify: SourceOutcome<SelfVerifyData>;
  corpus: SourceOutcome<CorpusManifestData>;
  providers: SourceOutcome<ProvidersStatusData>;
}

export interface ClaimsSection {
  state: SectionState;
  error: string | null;
  claimsMeasured: number | null;
  claimsAsserted: number | null;
  itemCount: number | null;
  fingerprintShort: string | null;
  generatedAt: string | null;
}

export interface CorpusSection {
  state: SectionState;
  error: string | null;
  disclosure: string | null; // "DEMO" | "REAL"
  provenance: string | null;
  sha256Short: string | null;
  docCount: number | null;
  domainCount: number | null;
}

export interface LedgerSection {
  state: SectionState; // OK (POPULATED) / EMPTY / FETCH_FAILED
  error: string | null;
  count: number | null;
  latestFingerprintShort: string | null;
  capturedAt: string | null;
  drift: boolean | null;
  persistence: string | null;
}

export interface RateLimitSection {
  state: SectionState;
  error: string | null;
  persistence: string | null;
}

export interface BridgesSection {
  state: SectionState;
  error: string | null;
  items: Array<{ id: string; failClosed: boolean; enabled: boolean; hasSharedSecret: boolean }>;
}

export interface TruthPageModel {
  generatedAt: string;
  claims: ClaimsSection;
  corpus: CorpusSection;
  ledger: LedgerSection;
  rateLimit: RateLimitSection;
  bridges: BridgesSection;
}

export function shortHash(h: string | null | undefined, n = 12): string | null {
  if (!h) return null;
  return h.slice(0, n);
}

function buildClaims(src: SourceOutcome<SelfVerifyData>): ClaimsSection {
  if (!src.ok) {
    return {
      state: "FETCH_FAILED",
      error: src.error,
      claimsMeasured: null,
      claimsAsserted: null,
      itemCount: null,
      fingerprintShort: null,
      generatedAt: null,
    };
  }
  const d = src.data;
  return {
    state: "OK",
    error: null,
    claimsMeasured: d.claimsMeasured,
    claimsAsserted: d.claimsAsserted,
    itemCount: Array.isArray(d.items) ? d.items.length : null,
    fingerprintShort: shortHash(d.fingerprint),
    generatedAt: d.generatedAt ?? null,
  };
}

function buildCorpus(src: SourceOutcome<CorpusManifestData>): CorpusSection {
  if (!src.ok) {
    return {
      state: "FETCH_FAILED",
      error: src.error,
      disclosure: null,
      provenance: null,
      sha256Short: null,
      docCount: null,
      domainCount: null,
    };
  }
  const d = src.data;
  return {
    state: "OK",
    error: null,
    disclosure: d.disclosure,
    provenance: d.provenance,
    sha256Short: shortHash(d.sha256),
    docCount: d.docCount,
    domainCount: Array.isArray(d.domains) ? d.domains.length : null,
  };
}

// The ledger summary rides on the self-verify surface (router-composed).
function buildLedger(src: SourceOutcome<SelfVerifyData>): LedgerSection {
  if (!src.ok) {
    return {
      state: "FETCH_FAILED",
      error: src.error,
      count: null,
      latestFingerprintShort: null,
      capturedAt: null,
      drift: null,
      persistence: null,
    };
  }
  const s = src.data.truthLedgerSummary;
  if (!s || s.state === "EMPTY") {
    return {
      state: "EMPTY",
      error: null,
      count: s?.count ?? 0,
      latestFingerprintShort: null,
      capturedAt: null,
      drift: null,
      persistence: s?.persistence ?? null,
    };
  }
  return {
    state: "OK",
    error: null,
    count: s.count,
    latestFingerprintShort: shortHash(s.latestFingerprint),
    capturedAt: s.capturedAt,
    drift: s.drift,
    persistence: s.persistence,
  };
}

function buildRateLimit(src: SourceOutcome<ProvidersStatusData>): RateLimitSection {
  if (!src.ok) {
    return { state: "FETCH_FAILED", error: src.error, persistence: null };
  }
  return {
    state: "OK",
    error: null,
    persistence: src.data.rateLimit?.persistence ?? null,
  };
}

function buildBridges(src: SourceOutcome<SelfVerifyData>): BridgesSection {
  if (!src.ok) {
    return { state: "FETCH_FAILED", error: src.error, items: [] };
  }
  const bridges = Array.isArray(src.data.bridges) ? src.data.bridges : [];
  return {
    state: bridges.length > 0 ? "OK" : "EMPTY",
    error: null,
    items: bridges.map((b) => ({
      id: b.id,
      failClosed: b.failClosed === true,
      enabled: b.enabled,
      hasSharedSecret: b.hasSharedSecret,
    })),
  };
}

export function buildTruthPageModel(
  sources: TruthPageSources,
  now: () => string = () => new Date().toISOString(),
): TruthPageModel {
  return {
    generatedAt: now(),
    claims: buildClaims(sources.selfVerify),
    corpus: buildCorpus(sources.corpus),
    ledger: buildLedger(sources.selfVerify),
    rateLimit: buildRateLimit(sources.providers),
    bridges: buildBridges(sources.selfVerify),
  };
}
