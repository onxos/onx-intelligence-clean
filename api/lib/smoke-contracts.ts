// ============================================================
// LIVE SMOKE CONTRACTS — STE-K-08 "Truth proof on the real deploy"
// Deterministic contract EVALUATORS + an injectable-fetch runner
// that proves the DEPLOYED service (Render production) honours the
// honesty guarantees built across the waves. Zero LLM.
//
// NOT run in CI: it needs the network and a live environment. The
// CLI wrapper (scripts/smoke-live.ts) is invoked manually via
// `npm run smoke:live`. This module holds ONLY pure contract logic
// + a fetch-injected runner, so every contract is unit-tested with
// a mocked fetch (no network, fully deterministic).
//
// PRODUCTION SAFETY: single request per contract. We assert headers
// and disclosures from ONE call — we never flood the live service to
// trigger a real 429.
// ============================================================

import { TRUTH_SNAPSHOT_INTERVAL_MS } from "./truth-snapshot-cron";
import { computeBridgeSurfacesChecksum } from "./bridge-surfaces-checksum";
import {
  computeCorpusBridgeChecksum,
  computeIntentBridgeChecksum,
  computeTitanBridgeChecksum,
} from "./bridge-part-checksums";
import { computeSelfVerifyFingerprint } from "./self-verify-fingerprint";

// Minimal response shape we depend on (Node/undici fetch compatible).
export interface SmokeResponse {
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<SmokeResponse>;

export interface ContractResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SmokeReport {
  harness: "LIVE_SMOKE_DETERMINISTIC";
  baseUrl: string;
  expectedSha: string | null;
  startedAt: string;
  total: number;
  passedCount: number;
  failedCount: number;
  passed: boolean;
  contracts: ContractResult[];
}

const FIVE_STATE = new Set([
  "IMPLEMENTED_PROVEN",
  "PARTIAL",
  "DOCUMENTED_ONLY",
  "DEMO",
  "MISSING",
]);

// --- tRPC-over-HTTP helpers (superjson transformer) ---------

// Query URL. superjson expects the input wrapped as { json: <value> }.
export function trpcGetUrl(baseUrl: string, path: string, input?: unknown): string {
  const base = `${baseUrl.replace(/\/$/, "")}/api/trpc/${path}`;
  if (input === undefined) return base;
  const enc = encodeURIComponent(JSON.stringify({ json: input }));
  return `${base}?input=${enc}`;
}

// superjson POST body for a mutation input.
export function trpcBody(input: unknown): string {
  return JSON.stringify({ json: input });
}

// Unwrap a tRPC response envelope: success → { ok:true, data },
// error → { ok:false, error:{ message, httpStatus } }.
export function unwrapTrpc(payload: unknown): {
  ok: boolean;
  data?: unknown;
  error?: { message: string; httpStatus: number };
} {
  const p = payload as {
    result?: { data?: { json?: unknown } };
    error?: { json?: { message?: string; data?: { httpStatus?: number } } };
  };
  if (p?.error) {
    return {
      ok: false,
      error: {
        message: String(p.error.json?.message ?? "unknown error"),
        httpStatus: Number(p.error.json?.data?.httpStatus ?? 0),
      },
    };
  }
  const data = p?.result?.data;
  // superjson wraps the value under `.json`; fall back to the raw data.
  const value = data && typeof data === "object" && "json" in data ? data.json : data;
  return { ok: true, data: value };
}

// A leak guard used across contracts: no smoke response may echo a
// full provider key. We only ever expect keyPrefix (≤ 8 chars).
export function assertNoKeyLeak(raw: string): string | null {
  // A real OpenAI-style secret is `sk-` + 20+ chars; keyPrefix is short.
  const m = raw.match(/sk-[A-Za-z0-9]{20,}/);
  return m ? `possible key leak: ${m[0].slice(0, 6)}…` : null;
}

// STE-K-25: render proof for the served /truth page. A bare `200 OK`
// with an empty body would silently pass a leak-only scan — so we
// additionally prove the response is the REAL built SPA shell (the
// document that boots the Truth route), not an empty/error shell.
//
// Markers are MEASURED from the live built index.html, not assumed:
//   <div id="root"></div>                       -> SPA mount root
//   <script type="module" ... src="/assets/…">  -> the built app bundle
// A hollow shell (no root, or no module bundle wired in) fails HONESTLY
// instead of masquerading as a live page. Returns null when the page is
// proven rendered, or a human reason string describing what is missing.
export function assertTruthPageRendered(status: number, html: string): string | null {
  if (status !== 200) return `status ${status}`;
  const body = html ?? "";
  const hasRoot = /id=["']root["']/.test(body);
  const hasModuleBundle = /<script[^>]+type=["']module["'][^>]*src=["']\/assets\//.test(body);
  const missing: string[] = [];
  if (!hasRoot) missing.push("no SPA root (#root)");
  if (!hasModuleBundle) missing.push("no built module bundle (/assets/*.js)");
  return missing.length === 0 ? null : missing.join(", ");
}

// --- Pure contract evaluators (unit-tested directly) --------

// Shared commit-equality: accept full or prefix match (short SHAs
// are legitimate on /health vs a full expected SHA).
export function commitMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

// The committed corpus-manifest.json contract — injected (never read
// from fs inside contract logic) so the evaluator stays pure and
// unit-testable. Only the fields we assert against the live surface.
export interface CorpusManifestContract {
  disclosure: string;
  provenance: string;
  docCount: number;
  domains: string[];
  sha256: string;
}

// STE-K-11: prove the DEPLOYED corpus manifest matches the committed
// contract corpus-manifest.json — i.e. the knowledge content shipped
// live is byte-identical (by content-identity sha256) to what CI
// pinned. `deployFresh` is true when /health confirmed the live
// commit equals EXPECT_COMMIT.
//
// HONEST FRESHNESS TOLERANCE (K-08 doctrine): if the live deploy is
// NOT confirmed fresh, a sha mismatch is an EXPECTED content-freshness
// lag, not a breach — we report BOTH fingerprints and pass with a
// pending note (never pass by wishing, never fail ambiguously). With a
// confirmed-fresh deploy, a sha mismatch is a REAL breach → fail. The
// structural invariants (disclosure/provenance/docCount/domainCount)
// must always match: those do not drift with freshness.
export function checkCorpusManifestTruth(
  status: number,
  live: {
    disclosure?: string;
    provenance?: string;
    docCount?: number;
    domains?: string[];
    sha256?: string;
  },
  committed: CorpusManifestContract | null,
  deployFresh: boolean,
): ContractResult {
  const name = "corpus_manifest_truth";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  if (!committed)
    return { name, passed: false, detail: "no committed corpus-manifest.json injected" };
  if (!/^[0-9a-f]{64}$/.test(String(live?.sha256)))
    return { name, passed: false, detail: `live sha256 not hex: ${live?.sha256}` };

  const liveDomainCount = (live?.domains ?? []).length;
  const committedDomainCount = committed.domains.length;
  const structural: Array<[string, unknown, unknown]> = [
    ["disclosure", committed.disclosure, live?.disclosure],
    ["provenance", committed.provenance, live?.provenance],
    ["docCount", committed.docCount, live?.docCount],
    ["domainCount", committedDomainCount, liveDomainCount],
  ];
  for (const [field, want, got] of structural) {
    if (want !== got)
      return { name, passed: false, detail: `${field} mismatch: committed=${want} live=${got}` };
  }

  const shaMatch = live?.sha256 === committed.sha256;
  if (shaMatch)
    return {
      name,
      passed: true,
      detail: `live manifest sha256 matches committed (${committed.sha256.slice(0, 12)}) — deployed content identical, disclosure=${committed.disclosure}`,
    };

  // sha differs.
  const both = `live=${String(live?.sha256).slice(0, 12)} committed=${committed.sha256.slice(0, 12)}`;
  if (deployFresh)
    return {
      name,
      passed: false,
      detail: `sha256 MISMATCH on a confirmed-fresh deploy (${both}) — deployed knowledge content differs from the committed contract`,
    };
  return {
    name,
    passed: true,
    detail: `sha256 differs but deploy not confirmed fresh — content-freshness PENDING (${both}); re-run with EXPECT_COMMIT once Render redeploys`,
  };
}

export function checkHealth(
  status: number,
  body: { status?: string; env?: string; commit?: string; uptime?: unknown; timestamp?: string },
  expectedSha: string | null,
  nowMs?: number,
): ContractResult {
  const name = "health_live";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  if (body?.status !== "ALIVE")
    return { name, passed: false, detail: `status != ALIVE (${body?.status})` };
  if (!body?.commit) return { name, passed: false, detail: "no commit field" };
  if (!/^[0-9a-f]{7,40}$/i.test(String(body.commit)))
    return { name, passed: false, detail: `commit is not sha-like hex (${body.commit})` };
  const env = String(body?.env ?? "");
  const ALLOWED_ENVS = new Set(["production", "development", "test", "staging"]);
  if (!ALLOWED_ENVS.has(env))
    return { name, passed: false, detail: `env is not in allowed set (${env || "missing"})` };
  if (body?.uptime !== undefined) {
    const uptime = Number(body.uptime);
    if (!Number.isFinite(uptime) || uptime < 0)
      return { name, passed: false, detail: `uptime is missing/invalid (${body.uptime})` };
  }
  if (body?.timestamp !== undefined) {
    const ts = Date.parse(String(body.timestamp));
    if (!Number.isFinite(ts))
      return { name, passed: false, detail: `timestamp is not parseable (${body.timestamp})` };
    const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
    const maxFutureSkewMs = 2 * 60 * 1000;
    if (ts > now + maxFutureSkewMs)
      return { name, passed: false, detail: `timestamp is in the future beyond skew tolerance (${body.timestamp})` };
  }
  if (expectedSha) {
    // Accept full or prefix match (short SHAs are legitimate).
    const a = body.commit;
    const b = expectedSha;
    const matches = a === b || a.startsWith(b) || b.startsWith(a);
    if (!matches)
      return { name, passed: false, detail: `commit ${a} != expected ${b}` };
  }
  return {
    name,
    passed: true,
    detail: `ALIVE env=${body.env} commit=${body.commit.slice(0, 12)}`,
  };
}

export function checkSelfVerify(
  status: number,
  data: {
    items?: Array<{ area?: string; detail?: string; verdict?: string; measured?: boolean; name?: string }>;
    claimsMeasured?: number;
    claimsAsserted?: number;
    fingerprint?: string;
    // STE-P-293: the fingerprint sections are served in the SAME body
    // (onx.selfVerify returns the full report) — captured here so the
    // contract can RECOMPUTE the fingerprint instead of trusting it.
    health?: Array<{ name?: string; status?: string }>;
    corpus?: { rawTotal?: number; uniqueByTitleBody?: number; duplicates?: number; persistence?: string };
    providers?: Array<{ id?: string; status?: string }>;
    bridges?: Array<{ id?: string; enabled?: boolean; hasSharedSecret?: boolean; failClosed?: boolean }>;
    bridgeRuntime?: {
      bridge?: string;
      bridgeEnabled?: boolean;
      hasSharedSecret?: boolean;
      providerCounts?: {
        validated?: number;
        configuredUnprobed?: number;
        missingKey?: number;
      };
      memoryMode?: string;
      compatibility?: string;
      commitSha?: string | null;
      checksum?: string;
    };
    truthLedgerSummary?: {
      state?: string;
      persistence?: string;
      count?: number;
      latestFingerprint?: string | null;
      capturedAt?: string | null;
      claimsMeasured?: number | null;
      claimsAsserted?: number | null;
      drift?: boolean;
      retention?: {
        keep?: number;
        oldestRetainedId?: number | null;
        oldestRetainedIsGenesis?: boolean;
      };
    };
  },
  schedulerCoherence?: {
    status: number;
    rows?: Array<{
      active?: boolean;
      interval?: number;
      intervalHuman?: string;
      lastRun?: string | null;
      nextRun?: string | null;
      msUntilNext?: number | null;
      runCount?: number;
      status?: string;
    }>;
    nowMs?: number;
  },
): ContractResult {
  const name = "honest_status_selfverify";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  const items = data?.items ?? [];
  if (items.length === 0) return { name, passed: false, detail: "no self-verify items" };
  if (!/^[0-9a-f]{64}$/.test(String(data?.fingerprint)))
    return { name, passed: false, detail: "fingerprint is not sha256 hex" };
  const badVerdict = items.find((i) => !FIVE_STATE.has(String(i.verdict)));
  if (badVerdict)
    return { name, passed: false, detail: `non-five-state verdict: ${badVerdict.verdict}` };
  const badMeasured = items.find((i) => typeof i.measured !== "boolean");
  if (badMeasured)
    return { name, passed: false, detail: `item ${badMeasured.name ?? "?"} measured flag is not boolean` };
  const measuredCount = items.filter((i) => i.measured === true).length;
  const assertedCount = items.length - measuredCount;
  if (Number(data?.claimsMeasured) !== measuredCount)
    return {
      name,
      passed: false,
      detail: `claimsMeasured=${data?.claimsMeasured} mismatches measured items (${measuredCount})`,
    };
  if (Number(data?.claimsAsserted) !== assertedCount)
    return {
      name,
      passed: false,
      detail: `claimsAsserted=${data?.claimsAsserted} mismatches asserted items (${assertedCount})`,
    };
  const bridgeRuntime = data?.bridgeRuntime;
  if (!bridgeRuntime)
    return { name, passed: false, detail: "bridgeRuntime proof missing from selfVerify" };
  if (bridgeRuntime.bridge !== "titanBridge")
    return { name, passed: false, detail: `bridgeRuntime.bridge invalid (${String(bridgeRuntime.bridge)})` };
  if (typeof bridgeRuntime.bridgeEnabled !== "boolean")
    return {
      name,
      passed: false,
      detail: `bridgeRuntime.bridgeEnabled invalid (${String(bridgeRuntime.bridgeEnabled)})`,
    };
  if (typeof bridgeRuntime.hasSharedSecret !== "boolean")
    return {
      name,
      passed: false,
      detail: `bridgeRuntime.hasSharedSecret invalid (${String(bridgeRuntime.hasSharedSecret)})`,
    };
  if (!bridgeRuntime.providerCounts)
    return { name, passed: false, detail: "bridgeRuntime.providerCounts missing" };
  for (const [label, value] of Object.entries(bridgeRuntime.providerCounts)) {
    if (!Number.isInteger(value) || Number(value) < 0)
      return { name, passed: false, detail: `bridgeRuntime.providerCounts.${label} invalid (${String(value)})` };
  }
  const providerTotal = Object.values(bridgeRuntime.providerCounts).reduce((sum, value) => sum + Number(value), 0);
  const providerItems = items.filter((i) => i.area === "providers");
  if (providerItems.length > 0 && providerTotal !== providerItems.length)
    return {
      name,
      passed: false,
      detail: `bridgeRuntime.providerCounts total ${providerTotal} mismatches provider items (${providerItems.length})`,
    };
  if (bridgeRuntime.memoryMode !== "pg" && bridgeRuntime.memoryMode !== "memory")
    return { name, passed: false, detail: `bridgeRuntime.memoryMode invalid (${String(bridgeRuntime.memoryMode)})` };
  if (bridgeRuntime.compatibility !== "BRIDGE_READY" && bridgeRuntime.compatibility !== "BRIDGE_GUARDED")
    return {
      name,
      passed: false,
      detail: `bridgeRuntime.compatibility invalid (${String(bridgeRuntime.compatibility)})`,
    };
  if (
    bridgeRuntime.compatibility === "BRIDGE_READY" &&
    (!bridgeRuntime.bridgeEnabled || !bridgeRuntime.hasSharedSecret)
  ) return {
    name,
    passed: false,
    detail: "bridgeRuntime.compatibility=BRIDGE_READY requires bridgeEnabled=true and hasSharedSecret=true",
  };
  if (
    bridgeRuntime.compatibility === "BRIDGE_GUARDED" &&
    bridgeRuntime.bridgeEnabled &&
    bridgeRuntime.hasSharedSecret
  ) return {
    name,
    passed: false,
    detail: "bridgeRuntime.compatibility=BRIDGE_GUARDED inconsistent with enabled bridge + shared secret",
  };
  if (bridgeRuntime.commitSha !== null && !/^[0-9a-f]{40}$/i.test(String(bridgeRuntime.commitSha)))
    return { name, passed: false, detail: `bridgeRuntime.commitSha invalid (${String(bridgeRuntime.commitSha)})` };
  if (!/^[0-9a-f]{64}$/.test(String(bridgeRuntime.checksum)))
    return { name, passed: false, detail: "bridgeRuntime.checksum is not sha256 hex" };
  // ---- STE-P-293: fingerprint RECOMPUTATION (anti-forgery) ----
  // The fingerprint anchors every truth-ledger snapshot and all drift
  // detection. A forged-but-well-formed value would poison the whole
  // truth chain, so we rebuild it from the SERVED sections via the
  // same shared canonical helper the server uses — trust nothing.
  const missingSections: string[] = [];
  if (!Array.isArray(data?.health) || data.health.length === 0) missingSections.push("health");
  if (!data?.corpus) missingSections.push("corpus");
  if (!Array.isArray(data?.providers) || data.providers.length === 0) missingSections.push("providers");
  if (!Array.isArray(data?.bridges) || data.bridges.length === 0) missingSections.push("bridges");
  if (missingSections.length > 0)
    return {
      name,
      passed: false,
      detail: `fingerprint sections missing from served report: ${missingSections.join(", ")}`,
    };
  const badBridge = (data.bridges ?? []).find(
    (b) =>
      typeof b?.id !== "string" ||
      typeof b?.enabled !== "boolean" ||
      typeof b?.hasSharedSecret !== "boolean" ||
      typeof b?.failClosed !== "boolean",
  );
  if (badBridge)
    return { name, passed: false, detail: `bridges entry malformed (${String(badBridge?.id ?? "?")})` };
  const corpusSection = data.corpus ?? {};
  if (
    !Number.isInteger(corpusSection.rawTotal) ||
    !Number.isInteger(corpusSection.uniqueByTitleBody) ||
    !Number.isInteger(corpusSection.duplicates) ||
    typeof corpusSection.persistence !== "string"
  )
    return { name, passed: false, detail: "corpus section malformed (rawTotal/uniqueByTitleBody/duplicates/persistence)" };
  const recomputedFingerprint = computeSelfVerifyFingerprint({
    items: items.map((i) => ({
      area: String(i.area),
      name: String(i.name),
      verdict: String(i.verdict),
      measured: i.measured === true,
    })),
    health: (data.health ?? []).map((h) => ({ name: String(h.name), status: String(h.status) })),
    corpus: {
      rawTotal: Number(corpusSection.rawTotal),
      uniqueByTitleBody: Number(corpusSection.uniqueByTitleBody),
      duplicates: Number(corpusSection.duplicates),
      persistence: String(corpusSection.persistence),
    },
    providers: (data.providers ?? []).map((p) => ({ id: String(p.id), status: String(p.status) })),
    bridges: (data.bridges ?? []).map((b) => ({
      id: String(b.id),
      enabled: b.enabled === true,
      hasSharedSecret: b.hasSharedSecret === true,
      failClosed: b.failClosed === true,
    })),
    bridgeRuntime: {
      bridge: String(bridgeRuntime.bridge),
      bridgeEnabled: bridgeRuntime.bridgeEnabled === true,
      hasSharedSecret: bridgeRuntime.hasSharedSecret === true,
      providerCounts: {
        validated: Number(bridgeRuntime.providerCounts?.validated),
        configuredUnprobed: Number(bridgeRuntime.providerCounts?.configuredUnprobed),
        missingKey: Number(bridgeRuntime.providerCounts?.missingKey),
      },
      memoryMode: String(bridgeRuntime.memoryMode),
      compatibility: String(bridgeRuntime.compatibility),
      commitSha: bridgeRuntime.commitSha ?? null,
      checksum: String(bridgeRuntime.checksum),
    },
    claimsMeasured: Number(data.claimsMeasured),
    claimsAsserted: Number(data.claimsAsserted),
  });
  if (recomputedFingerprint !== data.fingerprint)
    return {
      name,
      passed: false,
      detail: `fingerprint forged/stale: served=${String(data.fingerprint)} recomputed=${recomputedFingerprint}`,
    };
  const summary = data?.truthLedgerSummary;
  const total = summary?.count;
  if (!Number.isInteger(total) || Number(total) < 0)
    return { name, passed: false, detail: `truthLedgerSummary.count missing/invalid (${total})` };
  if (!summary || (summary.state !== "EMPTY" && summary.state !== "POPULATED"))
    return { name, passed: false, detail: `truthLedgerSummary.state invalid (${String(summary?.state)})` };
  if (summary.persistence !== "POSTGRES" && summary.persistence !== "UNPERSISTED")
    return { name, passed: false, detail: `truthLedgerSummary.persistence invalid (${String(summary.persistence)})` };
  if (typeof summary.drift !== "boolean")
    return { name, passed: false, detail: `truthLedgerSummary.drift invalid (${String(summary.drift)})` };
  const retention = summary.retention;
  if (!retention)
    return { name, passed: false, detail: "truthLedgerSummary.retention missing" };
  if (typeof retention.keep !== "number" || !Number.isFinite(retention.keep) || retention.keep < 1)
    return { name, passed: false, detail: `truthLedgerSummary.retention.keep invalid (${String(retention.keep)})` };
  if (retention.oldestRetainedId !== null && (!Number.isInteger(retention.oldestRetainedId) || Number(retention.oldestRetainedId) < 1))
    return {
      name,
      passed: false,
      detail: `truthLedgerSummary.retention.oldestRetainedId invalid (${String(retention.oldestRetainedId)})`,
    };
  if (typeof retention.oldestRetainedIsGenesis !== "boolean")
    return {
      name,
      passed: false,
      detail: `truthLedgerSummary.retention.oldestRetainedIsGenesis invalid (${String(retention.oldestRetainedIsGenesis)})`,
    };
  if (retention.oldestRetainedId === 1 && retention.oldestRetainedIsGenesis !== true)
    return {
      name,
      passed: false,
      detail: "truthLedgerSummary.retention inconsistent: oldestRetainedId=1 requires oldestRetainedIsGenesis=true",
    };
  if (retention.oldestRetainedId !== 1 && retention.oldestRetainedIsGenesis === true)
    return {
      name,
      passed: false,
      detail: `truthLedgerSummary.retention inconsistent: oldestRetainedIsGenesis=true with oldestRetainedId=${String(retention.oldestRetainedId)}`,
    };
  if (summary.state === "EMPTY") {
    if (summary.count !== 0)
      return { name, passed: false, detail: `truthLedgerSummary.state=EMPTY but count=${String(summary.count)}` };
    if (summary.latestFingerprint !== null)
      return { name, passed: false, detail: "truthLedgerSummary.state=EMPTY requires latestFingerprint=null" };
    if (summary.capturedAt !== null)
      return { name, passed: false, detail: "truthLedgerSummary.state=EMPTY requires capturedAt=null" };
    if (summary.claimsMeasured !== null || summary.claimsAsserted !== null)
      return { name, passed: false, detail: "truthLedgerSummary.state=EMPTY requires null claim counters" };
    if (summary.drift !== false)
      return { name, passed: false, detail: "truthLedgerSummary.state=EMPTY requires drift=false" };
  }
  if (summary.state === "POPULATED") {
    if (!Number.isInteger(summary.count) || Number(summary.count) < 1)
      return { name, passed: false, detail: `truthLedgerSummary.state=POPULATED requires count>=1 (${String(summary.count)})` };
    if (!/^[0-9a-f]{64}$/.test(String(summary.latestFingerprint)))
      return { name, passed: false, detail: `truthLedgerSummary.latestFingerprint invalid (${String(summary.latestFingerprint)})` };
    if (typeof summary.capturedAt !== "string" || !Number.isFinite(Date.parse(summary.capturedAt)))
      return { name, passed: false, detail: `truthLedgerSummary.capturedAt invalid (${String(summary.capturedAt)})` };
    if (!Number.isInteger(summary.claimsMeasured) || Number(summary.claimsMeasured) < 0)
      return { name, passed: false, detail: `truthLedgerSummary.claimsMeasured invalid (${String(summary.claimsMeasured)})` };
    if (!Number.isInteger(summary.claimsAsserted) || Number(summary.claimsAsserted) < 0)
      return { name, passed: false, detail: `truthLedgerSummary.claimsAsserted invalid (${String(summary.claimsAsserted)})` };
  }
  if (schedulerCoherence) {
    if (schedulerCoherence.status !== 200)
      return {
        name,
        passed: false,
        detail: `scheduler.status unavailable for coherence check (status ${schedulerCoherence.status})`,
      };
    const rows = schedulerCoherence.rows;
    if (!Array.isArray(rows) || rows.length === 0)
      return { name, passed: false, detail: "scheduler.status rows missing/empty for coherence check" };
    const schedulerItem = items.find((i) => i.name === "Scheduler");
    if (!schedulerItem)
      return { name, passed: false, detail: "selfVerify missing Scheduler item for scheduler coherence check" };
    const detail = String((schedulerItem as { detail?: string }).detail ?? "");
    const m = detail.match(/^(\d+)\/(\d+) rhythms active, (\d+) failing; IUC cron (active|paused)(?:, last tick (.+))?$/);
    if (!m)
      return {
        name,
        passed: false,
        detail: `Scheduler detail shape mismatch (${detail || "missing"})`,
      };
    const detailActive = Number(m[1]);
    const detailTotal = Number(m[2]);
    const detailFailing = Number(m[3]);
    const cronStatus = m[4];
    const lastTickAt = m[5];
    if ((cronStatus !== "active" && cronStatus !== "paused"))
      return { name, passed: false, detail: `Scheduler cron status invalid (${cronStatus})` };
    if (lastTickAt !== undefined && !Number.isFinite(Date.parse(lastTickAt)))
      return { name, passed: false, detail: `Scheduler last tick timestamp invalid (${lastTickAt})` };

    let activeCount = 0;
    let failingCount = 0;
    for (const row of rows) {
      if (typeof row?.active !== "boolean")
        return { name, passed: false, detail: "scheduler.status row missing boolean active" };
      if (!Number.isInteger(row?.interval) || Number(row.interval) < 1000)
        return {
          name,
          passed: false,
          detail: `scheduler.status row interval invalid (${String(row?.interval)})`,
        };
      const interval = Number(row.interval);
      const expectedIntervalHuman =
        interval >= 86400000 ? `${interval / 86400000}d`
          : interval >= 3600000 ? `${interval / 3600000}h`
            : interval >= 60000 ? `${interval / 60000}m`
              : `${interval / 1000}s`;
      if (String(row.intervalHuman) !== expectedIntervalHuman)
        return {
          name,
          passed: false,
          detail: `scheduler intervalHuman mismatch (${String(row.intervalHuman)} != ${expectedIntervalHuman})`,
        };
      if (row.nextRun == null && row.msUntilNext != null)
        return { name, passed: false, detail: "scheduler nextRun/msUntilNext mismatch (nextRun=null with msUntilNext present)" };
      if (row.nextRun != null && row.msUntilNext == null)
        return { name, passed: false, detail: "scheduler nextRun/msUntilNext mismatch (nextRun present with msUntilNext=null)" };
      if (row.nextRun != null) {
        const nextRunMs = Date.parse(String(row.nextRun));
        if (!Number.isFinite(nextRunMs))
          return {
            name,
            passed: false,
            detail: `scheduler nextRun invalid (${String(row.nextRun)})`,
          };
        if (!Number.isFinite(Number(row.msUntilNext)) || Number(row.msUntilNext) < 0)
          return {
            name,
            passed: false,
            detail: `scheduler msUntilNext invalid (${String(row.msUntilNext)})`,
          };
        const now = typeof schedulerCoherence.nowMs === "number" && Number.isFinite(schedulerCoherence.nowMs)
          ? schedulerCoherence.nowMs
          : null;
        if (now != null) {
          const expectedMsUntilNext = Math.max(0, nextRunMs - now);
          // Server clock + network jitter tolerance (2 minutes).
          if (Math.abs(Number(row.msUntilNext) - expectedMsUntilNext) > 120000)
            return {
              name,
              passed: false,
              detail: `scheduler msUntilNext inconsistent with nextRun (${String(row.msUntilNext)} vs expected ${String(expectedMsUntilNext)})`,
            };
        }
      }
      if (row.active === false && row.nextRun != null)
        return {
          name,
          passed: false,
          detail: "scheduler active/nextRun mismatch (inactive rhythm has nextRun)",
        };
      if (row.active === true && row.nextRun == null)
        return {
          name,
          passed: false,
          detail: "scheduler active/nextRun mismatch (active rhythm missing nextRun)",
        };
      if (!Number.isInteger(row.runCount) || Number(row.runCount) < 0)
        return {
          name,
          passed: false,
          detail: `scheduler runCount invalid (${String(row.runCount)})`,
        };
      const runCount = Number(row.runCount);
      if (runCount === 0 && row.lastRun != null)
        return {
          name,
          passed: false,
          detail: "scheduler runCount/lastRun mismatch (runCount=0 with lastRun present)",
        };
      if (runCount > 0 && row.lastRun == null)
        return {
          name,
          passed: false,
          detail: "scheduler runCount/lastRun mismatch (runCount>0 with lastRun missing)",
        };
      if (row.lastRun != null && !Number.isFinite(Date.parse(String(row.lastRun))))
        return {
          name,
          passed: false,
          detail: `scheduler lastRun invalid (${String(row.lastRun)})`,
        };
      if (row.lastRun != null && row.nextRun != null && Date.parse(String(row.lastRun)) > Date.parse(String(row.nextRun)))
        return {
          name,
          passed: false,
          detail: "scheduler lastRun/nextRun order invalid (lastRun > nextRun)",
        };
      if (row.active) activeCount++;
      if (String(row.status) === "FAILING") failingCount++;
      if (!["HEALTHY", "DEGRADED", "FAILING"].includes(String(row.status)))
        return {
          name,
          passed: false,
          detail: `scheduler status invalid (${String(row.status)})`,
        };
    }
    const totalCount = rows.length;
    if (detailActive !== activeCount || detailTotal !== totalCount || detailFailing !== failingCount)
      return {
        name,
        passed: false,
        detail: `Scheduler detail mismatch vs scheduler.status (detail ${detailActive}/${detailTotal} failing=${detailFailing}; live ${activeCount}/${totalCount} failing=${failingCount})`,
      };
    const expectedSchedulerVerdict = failingCount > 0 ? "PARTIAL" : "IMPLEMENTED_PROVEN";
    if (String(schedulerItem.verdict) !== expectedSchedulerVerdict)
      return {
        name,
        passed: false,
        detail: `Scheduler verdict (${String(schedulerItem.verdict)}) inconsistent with failing rhythms (${failingCount})`,
      };
  }
  return {
    name,
    passed: true,
    detail: `${items.length} items, measured=${measuredCount} asserted=${assertedCount}, truthLedgerSummary.count=${total}; fingerprint RECOMPUTED from served sections and verified`,
  };
}

export function checkRateDisclosure(
  status: number,
  data: { rateLimit?: { persistence?: string; limit?: number; category?: string } },
  expectedPersistence?: string,
): ContractResult {
  const name = "rate_limit_disclosure";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  const rl = data?.rateLimit;
  if (!rl) return { name, passed: false, detail: "no rateLimit disclosure on public read" };
  // STE-K-19: the disclosure is MEASURED per window — accept either
  // honest backing store, reject anything else.
  const KNOWN = ["PER_INSTANCE_UNPERSISTED", "POSTGRES_PERSISTED"];
  if (!rl.persistence || !KNOWN.includes(rl.persistence))
    return { name, passed: false, detail: `unknown rate-limit persistence: ${rl.persistence}` };
  // When the operator asserts the deployment's backing store, the
  // measured value MUST match it — a mismatch is a real breach.
  if (expectedPersistence && rl.persistence !== expectedPersistence)
    return {
      name,
      passed: false,
      detail: `measured persistence=${rl.persistence} != expected ${expectedPersistence}`,
    };
  return {
    name,
    passed: true,
    detail: `limit=${rl.limit} category=${rl.category} persistence=${rl.persistence} (measured; single call — no flood)`,
  };
}

// STE-P-294: cross-surface identity for the ask.onx disclosures. Both
// ask surfaces embed a rateLimit disclosure served by the SAME limiter
// that backs providers.status (rate-limiter.ts), and a truthDisclosure
// whose corpus count is derived from the same manifest measurement that
// the committed corpus-manifest.json pins. Until P294 neither claim was
// verified: a forged persistence/limit/category on ask, or a fabricated
// corpus size inside the prose disclosure, would pass unnoticed. The
// runner captures the providers.status rateLimit (contract 3) and the
// committed docCount and feeds them here — zero extra requests. The
// `remaining` counter is deliberately excluded: it is per-window mutable
// state and legitimately differs between calls. All params are optional
// so standalone evaluator use stays tolerant (P290 pattern).
export interface AskCrossSurface {
  rateLimit?: { persistence?: string; limit?: number; category?: string };
  committedDocCount?: number;
  // Byte-identity across the two ask surfaces: both compose the
  // disclosure via the same buildTruthDisclosure(), so any divergence
  // within one smoke run is a measured lie.
  peerTruthDisclosure?: string;
}

// First integer in the disclosure prose is the corpus unit count in
// both honest formats (DEMO leads with rawTotal, AUTHENTIC leads with
// docCount) — measured from answer-composer.ts:95-105.
export function extractCorpusCountFromDisclosure(disclosure: string): number | null {
  const m = /\d+/.exec(disclosure);
  return m ? Number(m[0]) : null;
}

function askCrossSurfaceFailure(
  data: {
    rateLimit?: { persistence?: string; limit?: number; category?: string };
    truthDisclosure?: string;
  },
  cross: AskCrossSurface,
): string | null {
  const peer = cross.rateLimit;
  if (peer) {
    const rl = data?.rateLimit;
    if (!rl)
      return "ask surface missing rateLimit disclosure (providers.status serves it from the same limiter)";
    if (String(rl.persistence) !== String(peer.persistence))
      return `cross-surface rateLimit drift vs providers.status: persistence ask=${rl.persistence} providers=${peer.persistence}`;
    if (Number(rl.limit) !== Number(peer.limit))
      return `cross-surface rateLimit drift vs providers.status: limit ask=${rl.limit} providers=${peer.limit}`;
    if (String(rl.category) !== String(peer.category))
      return `cross-surface rateLimit drift vs providers.status: category ask=${rl.category} providers=${peer.category}`;
  }
  if (typeof cross.committedDocCount === "number") {
    const claimed = extractCorpusCountFromDisclosure(String(data?.truthDisclosure ?? ""));
    if (claimed === null)
      return "truthDisclosure carries no measurable corpus count";
    if (claimed !== cross.committedDocCount)
      return `truthDisclosure claims ${claimed} units but committed manifest docCount=${cross.committedDocCount}`;
  }
  if (typeof cross.peerTruthDisclosure === "string") {
    if (String(data?.truthDisclosure) !== cross.peerTruthDisclosure)
      return "truthDisclosure diverges between ask surfaces (same composer must serve byte-identical prose)";
  }
  return null;
}

function askCrossSurfaceDetail(cross: AskCrossSurface | undefined): string {
  if (!cross) return "";
  const parts: string[] = [];
  if (cross.rateLimit) parts.push("rateLimit identical to providers.status (persistence+limit+category)");
  if (typeof cross.committedDocCount === "number")
    parts.push(`corpus count == committed docCount (${cross.committedDocCount})`);
  if (typeof cross.peerTruthDisclosure === "string")
    parts.push("disclosure byte-identical across ask surfaces");
  return parts.length > 0 ? `; cross-surface: ${parts.join(", ")}` : "";
}

export function checkAskRefusal(
  status: number,
  data: {
    status?: string;
    answer?: unknown;
    citations?: unknown[];
    truthDisclosure?: string;
    rateLimit?: { persistence?: string; limit?: number; category?: string };
  },
  cross?: AskCrossSurface,
): ContractResult {
  const name = "ask_onx_honest_refusal";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  if (data?.status !== "INSUFFICIENT_EVIDENCE")
    return { name, passed: false, detail: `status=${data?.status} (expected refusal)` };
  if (data?.answer !== null)
    return { name, passed: false, detail: "refusal must carry answer=null" };
  if ((data?.citations ?? []).length !== 0)
    return { name, passed: false, detail: "refusal must have zero citations (no fabrication)" };
  if (!String(data?.truthDisclosure).includes("DEMO"))
    return { name, passed: false, detail: "truthDisclosure missing DEMO" };
  if (cross) {
    const failure = askCrossSurfaceFailure(data, cross);
    if (failure) return { name, passed: false, detail: failure };
  }
  return {
    name,
    passed: true,
    detail: `out-of-corpus → honest refusal + DEMO disclosure${askCrossSurfaceDetail(cross)}`,
  };
}

export function checkAskCited(
  status: number,
  data: {
    status?: string;
    citations?: Array<{ domain?: string; title?: string; score?: number }>;
    truthDisclosure?: string;
    deterministic?: boolean;
    rateLimit?: { persistence?: string; limit?: number; category?: string };
  },
  cross?: AskCrossSurface,
): ContractResult {
  const name = "ask_onx_cited_answer";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  if (data?.status !== "ANSWERED")
    return { name, passed: false, detail: `status=${data?.status} (expected ANSWERED)` };
  const cites = data?.citations ?? [];
  if (cites.length === 0)
    return { name, passed: false, detail: "answered response must carry citations" };
  if (!String(data?.truthDisclosure).includes("DEMO"))
    return { name, passed: false, detail: "answered response must still disclose DEMO" };
  if (cross) {
    const failure = askCrossSurfaceFailure(data, cross);
    if (failure) return { name, passed: false, detail: failure };
  }
  return {
    name,
    passed: true,
    detail: `answered with ${cites.length} citations into the corpus + DEMO disclosure${askCrossSurfaceDetail(cross)}`,
  };
}

// Fail-closed proof. The bridge guard now throws a TRPCError, so over
// HTTP a keyless mutation surfaces as UNAUTHORIZED (401) / FORBIDDEN
// (403) — the honest auth codes. The core contract is: the mutation is
// REJECTED (never executed) and the error carries a BRIDGE_ marker. We
// assert the hardened 401/403, but a deployment still running the older
// build (plain Error → 500) is also a genuine fail-closed rejection, so
// we accept any 4xx/5xx rejection and record the observed code honestly.
export function checkBridgeFailClosed(
  status: number,
  unwrapped: { ok: boolean; error?: { message: string; httpStatus: number } },
): ContractResult {
  const name = "bridge_fail_closed";
  if (unwrapped.ok)
    return { name, passed: false, detail: "bridge mutation SUCCEEDED without a key (open!)" };
  const msg = unwrapped.error?.message ?? "";
  if (!/BRIDGE_/.test(msg))
    return { name, passed: false, detail: `rejected but no BRIDGE_ marker: ${msg.slice(0, 60)}` };
  const http = unwrapped.error?.httpStatus || status;
  if (http < 400)
    return { name, passed: false, detail: `rejection must be an error status, got ${http}` };
  const hardened = http === 401 || http === 403;
  const marker = msg.split(":")[0];
  return {
    name,
    passed: true,
    detail: hardened
      ? `rejected ${http} (${marker}) — mutation never ran, hardened fail-closed`
      : `rejected ${http} (${marker}) — mutation never ran; legacy build (pre-401 hardening)`,
  };
}

// STE-P-289: onx.bridgeSurfaces — the aggregated public bridge proof that
// the /truth page renders (P287 surface + P288 UI). This is the 10th live
// contract. It does NOT trust the served aggregate checksum: it RECOMPUTES
// it from the served per-bridge parts with the SAME canonical helper the
// server uses (bridge-surfaces-checksum.ts). A hand-forged/stale aggregate,
// a missing bridge, an inconsistent ready/guarded split, or a malformed
// per-bridge checksum all fail HONESTLY with a named detail.
//
// STE-P-290 DEEPENING (same contract, total stays 10): CROSS-SURFACE
// IDENTITY. selfVerify.bridgeRuntime and bridgeSurfaces.surfaces.titanBridge
// both derive from the SAME measured runtime evidence
// (bridge-runtime-proof.ts getRuntimeBridgeDeltaEvidence), so on one live
// deploy their checksum / compatibility / providerCounts / memoryMode MUST
// agree. Two public surfaces disagreeing about the same bridge is a measured
// lie — the runner feeds the bridgeRuntime it already fetched (no extra
// request) and any drift fails with a named cross-surface detail. Tolerant
// when the caller has no selfVerify data (standalone evaluator use).
//
// STE-P-291 DEEPENING (same contract, total stays 10): the SAME closure
// extended to the corpusQuery bridge. bridgeSurfaces.surfaces.corpusQuery
// embeds manifestSha256/corpusDocs read from getCorpusContentManifest()
// (bridge-surface-proof.ts:61-62) — the SAME source corpusQuery.manifest
// (contract #7) serves. The runner feeds the manifest it already fetched
// (zero extra requests); sha256 or docCount disagreement between the two
// public surfaces fails with a named cross-surface detail.
//
// STE-P-292 DEEPENING (same contract, total stays 10): PER-BRIDGE CHECKSUM
// RECOMPUTATION. Until now each per-bridge checksum was only format-checked
// (sha256 hex) — a forged-but-well-formed value passed. Every served
// per-bridge checksum is now RECOMPUTED from the served semantic fields
// with the SAME canonical helpers the server uses
// (bridge-part-checksums.ts), and each compatibility flag must agree with
// the served enabled/hasSharedSecret pair (getCompatibility semantics).
// A forged part checksum or a lying compatibility fails with a named detail.
const SHA256_HEX = /^[0-9a-f]{64}$/;
const EXPECTED_BRIDGES = ["corpusQuery", "intentEngine", "titanBridge"] as const;

interface ServedBridgeSurface {
  bridge?: string;
  compatibility?: string;
  checksum?: string;
  enabled?: boolean;
  hasSharedSecret?: boolean;
  memoryMode?: string;
  providerCounts?: { validated?: number; configuredUnprobed?: number; missingKey?: number };
  manifestSha256?: string;
  corpusDocs?: number;
  persistence?: string;
  publicSearch?: { engine?: string; indexedDocs?: number; probeQuery?: string; totalMatches?: number };
  classify?: {
    engine?: string;
    mode?: string;
    probeText?: string;
    topIntent?: string;
    topConfidence?: number;
    tokenCount?: number;
  };
}

// STE-P-292: recompute one served per-bridge checksum from its served
// semantic fields. Returns null when required fields are absent (named
// fail upstream) — never guesses.
function recomputeBridgePartChecksum(key: string, s: ServedBridgeSurface): string | null {
  if (typeof s.enabled !== "boolean" || typeof s.hasSharedSecret !== "boolean") return null;
  if (key === "corpusQuery") {
    if (
      typeof s.persistence !== "string" ||
      typeof s.manifestSha256 !== "string" ||
      typeof s.corpusDocs !== "number" ||
      !s.publicSearch ||
      typeof s.publicSearch.engine !== "string" ||
      typeof s.publicSearch.indexedDocs !== "number" ||
      typeof s.publicSearch.probeQuery !== "string" ||
      typeof s.publicSearch.totalMatches !== "number"
    ) return null;
    return computeCorpusBridgeChecksum({
      enabled: s.enabled,
      hasSharedSecret: s.hasSharedSecret,
      compatibility: String(s.compatibility),
      persistence: s.persistence,
      manifestSha256: s.manifestSha256,
      corpusDocs: s.corpusDocs,
      publicSearch: {
        engine: s.publicSearch.engine,
        indexedDocs: s.publicSearch.indexedDocs,
        probeQuery: s.publicSearch.probeQuery,
        totalMatches: s.publicSearch.totalMatches,
      },
    });
  }
  if (key === "intentEngine") {
    if (
      !s.classify ||
      typeof s.classify.engine !== "string" ||
      typeof s.classify.mode !== "string" ||
      typeof s.classify.probeText !== "string" ||
      typeof s.classify.topIntent !== "string" ||
      typeof s.classify.topConfidence !== "number" ||
      typeof s.classify.tokenCount !== "number"
    ) return null;
    return computeIntentBridgeChecksum({
      enabled: s.enabled,
      hasSharedSecret: s.hasSharedSecret,
      compatibility: String(s.compatibility),
      classify: {
        engine: s.classify.engine,
        mode: s.classify.mode,
        probeText: s.classify.probeText,
        topIntent: s.classify.topIntent,
        topConfidence: s.classify.topConfidence,
        tokenCount: s.classify.tokenCount,
      },
    });
  }
  if (
    !s.providerCounts ||
    typeof s.providerCounts.validated !== "number" ||
    typeof s.providerCounts.configuredUnprobed !== "number" ||
    typeof s.providerCounts.missingKey !== "number" ||
    typeof s.memoryMode !== "string"
  ) return null;
  return computeTitanBridgeChecksum({
    enabled: s.enabled,
    hasSharedSecret: s.hasSharedSecret,
    providerCounts: {
      validated: s.providerCounts.validated,
      configuredUnprobed: s.providerCounts.configuredUnprobed,
      missingKey: s.providerCounts.missingKey,
    },
    memoryMode: s.memoryMode,
  });
}

export interface BridgeRuntimeCrossSurface {
  compatibility?: string;
  checksum?: string;
  memoryMode?: string;
  providerCounts?: { validated?: number; configuredUnprobed?: number; missingKey?: number };
}

export interface CorpusManifestCrossSurface {
  sha256?: string;
  docCount?: number;
}

export function checkBridgeSurfacesRead(
  status: number,
  data: {
    access?: string;
    total?: number;
    ready?: number;
    guarded?: number;
    checksum?: string;
    surfaces?: Record<string, ServedBridgeSurface | undefined>;
  },
  selfVerifyBridgeRuntime?: BridgeRuntimeCrossSurface,
  corpusManifestCross?: CorpusManifestCrossSurface,
): ContractResult {
  const name = "bridge_surfaces_read";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  if (data?.access !== "PUBLIC_READ")
    return { name, passed: false, detail: `access must be PUBLIC_READ, got ${String(data?.access)}` };
  const surfaces = data?.surfaces ?? {};
  const parts: Array<{ bridge: string; compatibility: string; checksum: string }> = [];
  for (const key of EXPECTED_BRIDGES) {
    const s = surfaces[key];
    if (!s) return { name, passed: false, detail: `missing bridge surface: ${key}` };
    if (s.bridge !== key)
      return { name, passed: false, detail: `surface ${key} carries wrong bridge id: ${String(s.bridge)}` };
    if (s.compatibility !== "BRIDGE_READY" && s.compatibility !== "BRIDGE_GUARDED")
      return { name, passed: false, detail: `surface ${key} has unknown compatibility: ${String(s.compatibility)}` };
    if (typeof s.checksum !== "string" || !SHA256_HEX.test(s.checksum))
      return { name, passed: false, detail: `surface ${key} checksum is not sha256 hex` };
    // STE-P-292: compatibility must be derived honestly from the served
    // enabled/hasSharedSecret pair (getCompatibility semantics).
    if (typeof s.enabled === "boolean" && typeof s.hasSharedSecret === "boolean") {
      const derived = s.enabled && s.hasSharedSecret ? "BRIDGE_READY" : "BRIDGE_GUARDED";
      if (s.compatibility !== derived)
        return {
          name,
          passed: false,
          detail: `surface ${key} compatibility lies: served ${s.compatibility}, but enabled=${s.enabled} hasSharedSecret=${s.hasSharedSecret} derives ${derived}`,
        };
    }
    // STE-P-292: recompute the per-bridge checksum from served fields.
    const recomputedPart = recomputeBridgePartChecksum(key, s);
    if (recomputedPart === null)
      return {
        name,
        passed: false,
        detail: `surface ${key} is missing the semantic fields required to recompute its checksum`,
      };
    if (recomputedPart !== s.checksum)
      return {
        name,
        passed: false,
        detail: `per-bridge checksum forged/stale: ${key} served ${s.checksum.slice(0, 12)}, recomputed ${recomputedPart.slice(0, 12)}`,
      };
    parts.push({ bridge: key, compatibility: s.compatibility, checksum: s.checksum });
  }
  if (data?.total !== EXPECTED_BRIDGES.length)
    return { name, passed: false, detail: `total must be ${EXPECTED_BRIDGES.length}, got ${String(data?.total)}` };
  const measuredReady = parts.filter((p) => p.compatibility === "BRIDGE_READY").length;
  const measuredGuarded = parts.length - measuredReady;
  if (data?.ready !== measuredReady || data?.guarded !== measuredGuarded)
    return {
      name,
      passed: false,
      detail: `ready/guarded split lies: served ${String(data?.ready)}/${String(data?.guarded)}, measured ${measuredReady}/${measuredGuarded}`,
    };
  if (typeof data?.checksum !== "string" || !SHA256_HEX.test(data.checksum))
    return { name, passed: false, detail: "aggregate checksum is not sha256 hex" };
  const recomputed = computeBridgeSurfacesChecksum(parts, measuredReady, measuredGuarded);
  if (recomputed !== data.checksum)
    return {
      name,
      passed: false,
      detail: `aggregate checksum forged/stale: served ${data.checksum.slice(0, 12)}, recomputed ${recomputed.slice(0, 12)}`,
    };
  // STE-P-290: cross-surface identity — the titan part must be the SAME
  // measured evidence selfVerify.bridgeRuntime reports on this deploy.
  let crossDetail = "";
  if (selfVerifyBridgeRuntime) {
    const titan = surfaces.titanBridge as {
      compatibility?: string;
      checksum?: string;
      memoryMode?: string;
      providerCounts?: { validated?: number; configuredUnprobed?: number; missingKey?: number };
    };
    const rt = selfVerifyBridgeRuntime;
    if (rt.compatibility !== undefined && titan.compatibility !== rt.compatibility)
      return {
        name,
        passed: false,
        detail: `cross-surface drift: titanBridge.compatibility=${String(titan.compatibility)} but selfVerify.bridgeRuntime.compatibility=${String(rt.compatibility)}`,
      };
    if (rt.memoryMode !== undefined && titan.memoryMode !== undefined && titan.memoryMode !== rt.memoryMode)
      return {
        name,
        passed: false,
        detail: `cross-surface drift: titanBridge.memoryMode=${String(titan.memoryMode)} but selfVerify.bridgeRuntime.memoryMode=${String(rt.memoryMode)}`,
      };
    if (rt.providerCounts && titan.providerCounts) {
      for (const k of ["validated", "configuredUnprobed", "missingKey"] as const) {
        if (Number(titan.providerCounts[k]) !== Number(rt.providerCounts[k]))
          return {
            name,
            passed: false,
            detail: `cross-surface drift: titanBridge.providerCounts.${k}=${String(titan.providerCounts[k])} but selfVerify.bridgeRuntime.providerCounts.${k}=${String(rt.providerCounts[k])}`,
          };
      }
    }
    if (rt.checksum !== undefined && titan.checksum !== rt.checksum)
      return {
        name,
        passed: false,
        detail: `cross-surface drift: titanBridge.checksum=${String(titan.checksum).slice(0, 12)} but selfVerify.bridgeRuntime.checksum=${String(rt.checksum).slice(0, 12)} — same evidence source must agree`,
      };
    crossDetail = "; cross-surface identity vs selfVerify.bridgeRuntime verified (checksum match)";
  }
  // STE-P-291: cross-surface identity — the corpusQuery part embeds the
  // SAME manifest evidence corpusQuery.manifest serves on this deploy.
  if (corpusManifestCross) {
    const cq = surfaces.corpusQuery as { manifestSha256?: string; corpusDocs?: number };
    const cm = corpusManifestCross;
    if (cm.sha256 !== undefined && cq.manifestSha256 !== cm.sha256)
      return {
        name,
        passed: false,
        detail: `cross-surface drift: corpusQuery.manifestSha256=${String(cq.manifestSha256).slice(0, 12)} but corpusQuery.manifest.sha256=${String(cm.sha256).slice(0, 12)} — same manifest source must agree`,
      };
    if (cm.docCount !== undefined && Number(cq.corpusDocs) !== Number(cm.docCount))
      return {
        name,
        passed: false,
        detail: `cross-surface drift: corpusQuery.corpusDocs=${String(cq.corpusDocs)} but corpusQuery.manifest.docCount=${String(cm.docCount)}`,
      };
    crossDetail += "; cross-surface identity vs corpusQuery.manifest verified (sha256+docCount match)";
  }
  return {
    name,
    passed: true,
    detail: `3 bridges aggregated (ready=${measuredReady}, guarded=${measuredGuarded}); per-bridge checksums RECOMPUTED from served fields (3/3); aggregate checksum RECOMPUTED from served parts and verified (${recomputed.slice(0, 12)})${crossDetail}`,
  };
}

// STE-K-13: truth-ledger read surface (onx.truthHistory, public read).
// Proves the chronological OSVA snapshot store is reachable and shaped
// honestly. An EMPTY ledger remains a VALID, HONEST state (fresh boot
// before first capture tick, or prolonged capture failures) and is
// reported instead of fabricating history. When rows DO exist, every entry must
// carry a sha256 fingerprint, numeric claim counts, and a boolean drift
// flag (automatic truth-drift detection, truth-ledger.ts:138-146).
// STE-K-36 deepening: this same contract (no new contract) also verifies
// the row fields consumed by the human /truth table (K-31):
// id / capturedAt(createdAt) / fingerprint / drift / predecessorPruned edge
// + the derived genesis edge (id===1) constraints where applicable.
export function checkTruthLedgerRead(
  status: number,
  data: {
    persistence?: string;
    count?: number;
    retention?: {
      keep?: number;
      oldestRetainedId?: number | null;
      oldestRetainedIsGenesis?: boolean;
    };
    snapshots?: Array<{
      id?: number;
      fingerprint?: string;
      claimsMeasured?: number;
      claimsAsserted?: number;
      createdAt?: string;
      drift?: boolean;
      predecessorPruned?: boolean;
    }>;
  },
  truthLedgerTotalCount?: number,
  nowMs?: number,
  expectedWindowLimit?: number,
  truthLedgerSummary?: {
    state?: string;
    persistence?: string;
    count?: number;
    latestFingerprint?: string | null;
    capturedAt?: string | null;
    claimsMeasured?: number | null;
    claimsAsserted?: number | null;
    drift?: boolean;
    retention?: {
      keep?: number;
      oldestRetainedId?: number | null;
      oldestRetainedIsGenesis?: boolean;
    };
  },
): ContractResult {
  const name = "truth_ledger_read";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  const persistence = data?.persistence;
  if (persistence !== "POSTGRES" && persistence !== "UNPERSISTED")
    return { name, passed: false, detail: `unknown ledger persistence: ${persistence}` };
  // STE-K-22 (DEEPENING of the 9th contract — NOT a new contract; total stays
  // 9): the read surface discloses a MEASURED bounded-retention policy. When
  // present it must be honest: a positive keep window, and the live invariant
  // that the returned page never exceeds it. Tolerant when absent so older
  // fixtures/surfaces still validate.
  const retention = data?.retention;
  if (retention !== undefined) {
    if (typeof retention.keep !== "number" || !Number.isFinite(retention.keep) || retention.keep < 1)
      return { name, passed: false, detail: `retention.keep is not a positive number: ${retention.keep}` };
    const snapsForBound = Array.isArray(data?.snapshots) ? data!.snapshots! : [];
    if (snapsForBound.length > retention.keep)
      return {
        name,
        passed: false,
        detail: `page (${snapsForBound.length}) exceeds retention.keep (${retention.keep}) — retention not enforced`,
      };
  }
  if (retention !== undefined) {
    if (retention.oldestRetainedId !== null && (!Number.isInteger(retention.oldestRetainedId) || Number(retention.oldestRetainedId) < 1))
      return {
        name,
        passed: false,
        detail: `retention.oldestRetainedId invalid (${String(retention.oldestRetainedId)})`,
      };
    if (typeof retention.oldestRetainedIsGenesis !== "boolean")
      return {
        name,
        passed: false,
        detail: `retention.oldestRetainedIsGenesis invalid (${String(retention.oldestRetainedIsGenesis)})`,
      };
    if (retention.oldestRetainedId === 1 && retention.oldestRetainedIsGenesis !== true)
      return {
        name,
        passed: false,
        detail: "retention inconsistent: oldestRetainedId=1 requires oldestRetainedIsGenesis=true",
      };
    if (retention.oldestRetainedId !== 1 && retention.oldestRetainedIsGenesis === true)
      return {
        name,
        passed: false,
        detail: `retention inconsistent: oldestRetainedIsGenesis=true with oldestRetainedId=${String(retention.oldestRetainedId)}`,
      };
  }
  const snaps = data?.snapshots;
  if (!Array.isArray(snaps))
    return { name, passed: false, detail: "snapshots is not an array" };
  if (
    expectedWindowLimit !== undefined &&
    (!Number.isInteger(expectedWindowLimit) || expectedWindowLimit < 1)
  ) {
    return {
      name,
      passed: false,
      detail: `expectedWindowLimit invalid (${expectedWindowLimit})`,
    };
  }
  if (expectedWindowLimit !== undefined && snaps.length > expectedWindowLimit) {
    return {
      name,
      passed: false,
      detail: `returned rows (${snaps.length}) exceed requested limit (${expectedWindowLimit})`,
    };
  }
  if (Number(data?.count) !== snaps.length)
    return { name, passed: false, detail: `count (${data?.count}) != snapshots.length (${snaps.length})` };
  if (retention && snaps.length > 0 && retention.oldestRetainedId === null)
    return {
      name,
      passed: false,
      detail: "retention.oldestRetainedId invalid (null) while snapshots are populated",
    };
  if (truthLedgerTotalCount !== undefined) {
    if (!Number.isInteger(truthLedgerTotalCount) || truthLedgerTotalCount < 0)
      return {
        name,
        passed: false,
        detail: `truthLedgerSummary.count invalid for consistency check (${truthLedgerTotalCount})`,
      };
    if (truthLedgerTotalCount < snaps.length)
      return {
        name,
        passed: false,
        detail: `truthLedgerSummary.count (${truthLedgerTotalCount}) < window rows (${snaps.length}) — inconsistent total`,
      };
  }
  if (truthLedgerSummary !== undefined) {
    if (truthLedgerSummary.persistence !== persistence)
      return {
        name,
        passed: false,
        detail: `truthLedgerSummary.persistence (${String(truthLedgerSummary.persistence)}) != truthHistory.persistence (${String(persistence)})`,
      };
    if (retention && truthLedgerSummary.retention) {
      if (truthLedgerSummary.retention.keep !== retention.keep)
        return {
          name,
          passed: false,
          detail: `truthLedgerSummary.retention.keep (${String(truthLedgerSummary.retention.keep)}) != truthHistory.retention.keep (${String(retention.keep)})`,
        };
      const summaryOldest = truthLedgerSummary.retention.oldestRetainedId;
      const historyOldest = retention.oldestRetainedId;
      const monotonicRetentionAdvance = (
        typeof summaryOldest === "number" &&
        typeof historyOldest === "number" &&
        historyOldest >= summaryOldest
      );
      if (
        summaryOldest !== historyOldest &&
        !monotonicRetentionAdvance
      ) return {
        name,
        passed: false,
        detail: `truthLedgerSummary.retention.oldestRetainedId (${String(summaryOldest)}) != truthHistory.retention.oldestRetainedId (${String(historyOldest)})`,
      };
      if (
        truthLedgerSummary.retention.oldestRetainedIsGenesis !== retention.oldestRetainedIsGenesis &&
        summaryOldest === historyOldest
      ) return {
        name,
        passed: false,
        detail: `truthLedgerSummary.retention.oldestRetainedIsGenesis (${String(truthLedgerSummary.retention.oldestRetainedIsGenesis)}) != truthHistory.retention.oldestRetainedIsGenesis (${String(retention.oldestRetainedIsGenesis)})`,
      };
    }
  }
  // Empty ledger = honest "no live scheduled capture" state, not a breach.
  if (snaps.length === 0) {
    if (truthLedgerSummary) {
      if (truthLedgerSummary.state !== "EMPTY")
        return {
          name,
          passed: false,
          detail: `truthLedgerSummary.state (${String(truthLedgerSummary.state)}) inconsistent with empty truthHistory window`,
        };
      if (truthLedgerSummary.latestFingerprint !== null || truthLedgerSummary.capturedAt !== null)
        return {
          name,
          passed: false,
          detail: "truthLedgerSummary latest fingerprint/timestamp must be null when truthHistory window is empty",
        };
      if (truthLedgerSummary.claimsMeasured !== null || truthLedgerSummary.claimsAsserted !== null)
        return {
          name,
          passed: false,
          detail: "truthLedgerSummary claim counters must be null when truthHistory window is empty",
        };
      if (truthLedgerSummary.drift !== false)
        return {
          name,
          passed: false,
          detail: "truthLedgerSummary.drift must be false when truthHistory window is empty",
        };
    }
    return {
      name,
      passed: true,
      detail:
        truthLedgerTotalCount === undefined
          ? `ledger empty — honest: no live scheduled capture (persistence=${persistence})`
          : `ledger empty window (persistence=${persistence}); truthful total count=${truthLedgerTotalCount}`,
    };
  }
  const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : null;
  // STE-K-49 deepening: freshness threshold derived from measured hourly
  // cadence (TRUTH_SNAPSHOT_INTERVAL_MS) with an explicit jitter margin.
  const freshnessMaxAgeMs = (2 * TRUTH_SNAPSHOT_INTERVAL_MS) + (10 * 60 * 1000);
  for (const s of snaps) {
    if (!Number.isInteger(s?.id) || Number(s.id) < 1)
      return { name, passed: false, detail: `snapshot id is missing/invalid for table rows: ${s?.id}` };
    if (typeof s?.createdAt !== "string" || !Number.isFinite(Date.parse(s.createdAt)))
      return { name, passed: false, detail: `snapshot ${s?.id} missing/invalid createdAt` };
    if (!/^[0-9a-f]{64}$/.test(String(s?.fingerprint)))
      return { name, passed: false, detail: `snapshot ${s?.id} fingerprint not sha256` };
    if (typeof s?.claimsMeasured !== "number" || typeof s?.claimsAsserted !== "number")
      return { name, passed: false, detail: `snapshot ${s?.id} missing numeric claim counts` };
    if (typeof s?.drift !== "boolean")
      return { name, passed: false, detail: `snapshot ${s?.id} missing boolean drift flag` };
    if (s?.predecessorPruned !== undefined && typeof s.predecessorPruned !== "boolean")
      return { name, passed: false, detail: `snapshot ${s?.id} predecessorPruned must be boolean when present` };
  }
  if (now != null) {
    const latestCreatedAtMs = Date.parse(String(snaps[0]?.createdAt ?? ""));
    if (!Number.isFinite(latestCreatedAtMs))
      return { name, passed: false, detail: `snapshot ${snaps[0]?.id} missing/invalid createdAt` };
    const ageMs = now - latestCreatedAtMs;
    if (ageMs > freshnessMaxAgeMs)
      return {
        name,
        passed: false,
        detail: `latest snapshot is stale (${Math.floor(ageMs / 60000)}m old > ${Math.floor(freshnessMaxAgeMs / 60000)}m threshold for hourly capture)`,
      };
  }
  // STE-K-15: with >=2 snapshots we can prove the ledger is honest over
  // TIME, not just shaped right. Snapshots are newest-first, so:
  //  (1) chronological order: ids strictly descending and createdAt
  //      non-increasing (an out-of-order ledger is a fabrication).
  //  (2) drift-flag INTEGRITY: for every snapshot that has a visible
  //      predecessor, drift MUST equal (fp[i] !== fp[i+1]). A drift
  //      flag that disagrees with the actual fingerprint comparison is
  //      a fabricated signal — a breach. The oldest visible snapshot's
  //      predecessor is paged off (truth-ledger.ts fetches limit+1 then
  //      slices), so its flag is not re-derivable here and is skipped.
  if (snaps.length >= 2) {
    for (let i = 0; i < snaps.length - 1; i++) {
      const cur = snaps[i];
      const prev = snaps[i + 1];
      if (typeof cur.id === "number" && typeof prev.id === "number" && !(cur.id > prev.id))
        return { name, passed: false, detail: `snapshots not newest-first by id at ${cur.id} <= ${prev.id}` };
      if (cur.createdAt && prev.createdAt && cur.createdAt < prev.createdAt)
        return { name, passed: false, detail: `snapshot ${cur.id} createdAt precedes its predecessor (out of order)` };
      const expectedDrift = cur.fingerprint !== prev.fingerprint;
      if (cur.drift !== expectedDrift)
        return {
          name,
          passed: false,
          detail: `snapshot ${cur.id} drift=${cur.drift} contradicts fingerprint comparison (expected ${expectedDrift}) — fabricated drift`,
        };
    }
  }
  // STE-K-22 edge honesty: `predecessorPruned` may appear ONLY on the oldest
  // (last, newest-first) snapshot — it names the case where retention removed
  // that snapshot's true predecessor. It must never carry a fabricated drift:
  // with no measurable predecessor, drift must be false (named, not implied).
  for (let i = 0; i < snaps.length; i++) {
    if (!snaps[i]?.predecessorPruned) continue;
    if (i !== snaps.length - 1)
      return {
        name,
        passed: false,
        detail: `snapshot ${snaps[i]?.id} flagged predecessorPruned but is not the oldest in the page — dishonest edge`,
      };
    if (snaps[i]?.drift !== false)
      return {
        name,
        passed: false,
        detail: `snapshot ${snaps[i]?.id} predecessorPruned with drift=${snaps[i]?.drift} — drift is not measurable once the predecessor is pruned`,
      };
  }
  // `GENESIS` on /truth is derived from id===1. If present in the page,
  // genesis must be the OLDEST visible snapshot (newest-first order) and
  // can never be marked predecessorPruned.
  const genesisIdx = snaps.findIndex((s) => s?.id === 1);
  if (genesisIdx >= 0) {
    if (genesisIdx !== snaps.length - 1)
      return {
        name,
        passed: false,
        detail: "genesis row (id=1) is not the oldest visible snapshot",
      };
    if (snaps[genesisIdx]?.predecessorPruned === true)
      return {
        name,
        passed: false,
        detail: "genesis row (id=1) cannot be predecessorPruned",
      };
  }
  const drifted = snaps.filter((s) => s.drift).length;
  if (truthLedgerSummary) {
    if (truthLedgerSummary.state !== "POPULATED")
      return {
        name,
        passed: false,
        detail: `truthLedgerSummary.state (${String(truthLedgerSummary.state)}) inconsistent with populated truthHistory window`,
      };
    if (truthLedgerSummary.latestFingerprint !== snaps[0].fingerprint)
      return {
        name,
        passed: false,
        detail: `truthLedgerSummary.latestFingerprint (${String(truthLedgerSummary.latestFingerprint).slice(0, 12)}) != truthHistory latest (${String(snaps[0].fingerprint).slice(0, 12)})`,
      };
    if (truthLedgerSummary.capturedAt !== snaps[0].createdAt)
      return {
        name,
        passed: false,
        detail: `truthLedgerSummary.capturedAt (${String(truthLedgerSummary.capturedAt)}) != truthHistory latest.createdAt (${String(snaps[0].createdAt)})`,
      };
    if (truthLedgerSummary.claimsMeasured !== snaps[0].claimsMeasured)
      return {
        name,
        passed: false,
        detail: `truthLedgerSummary.claimsMeasured (${String(truthLedgerSummary.claimsMeasured)}) != truthHistory latest.claimsMeasured (${String(snaps[0].claimsMeasured)})`,
      };
    if (truthLedgerSummary.claimsAsserted !== snaps[0].claimsAsserted)
      return {
        name,
        passed: false,
        detail: `truthLedgerSummary.claimsAsserted (${String(truthLedgerSummary.claimsAsserted)}) != truthHistory latest.claimsAsserted (${String(snaps[0].claimsAsserted)})`,
      };
    if (truthLedgerSummary.drift !== snaps[0].drift)
      return {
        name,
        passed: false,
        detail: `truthLedgerSummary.drift (${String(truthLedgerSummary.drift)}) != truthHistory latest.drift (${String(snaps[0].drift)})`,
      };
  }
  const retentionNote = retention
    ? `, retention keep=${retention.keep} oldestRetainedId=${retention.oldestRetainedId ?? "none"}${retention.oldestRetainedIsGenesis ? " (genesis retained)" : " (older pruned)"}`
    : "";
  return {
    name,
    passed: true,
    detail: `${snaps.length} snapshots, ${drifted} drift-flagged, persistence=${persistence}${retentionNote}${truthLedgerTotalCount === undefined ? "" : `, total count=${truthLedgerTotalCount}`}`,
  };
}

// --- Runner (injectable fetch) ------------------------------

export const DEFAULT_BASE_URL = "https://onx-intelligence-clean.onrender.com";

// STE-K-20: the OFFICIAL single-origin gateway. `main` has retired from
// live service; every surface is reached through onx-gateway. The
// intelligence service is mounted (full-app, no path rewrite) under
// `/intelligence/*`, so the gateway preserves upstream paths exactly:
//   {origin}/intelligence/health            -> upstream /health
//   {origin}/intelligence/commit            -> upstream /commit
//   {origin}/intelligence/api/trpc/<proc>   -> upstream /api/trpc/<proc>
//   {origin}/intelligence/truth             -> upstream /truth
// This is MEASURED, not assumed: the sibling `/api/intelligence/*` mount
// rewrites to upstream `/api/*` (so it serves tRPC at
// /api/intelligence/trpc/<proc> but NOT /health or /commit, which live at
// the app root). The full-app mount below is therefore the ONE base that
// serves ALL nine doctrine surfaces through the single official origin.
export const DEFAULT_GATEWAY_ORIGIN = "https://onx-gateway.onrender.com";
export const GATEWAY_APP_MOUNT = "/intelligence";

/**
 * Build the single-origin smoke base URL for the official gateway.
 * Given a gateway origin, returns the full-app mount base that the
 * existing 9 contracts run against UNCHANGED — {base}/health,
 * {base}/commit, {base}/api/trpc/<proc>, {base}/truth all resolve.
 */
export function gatewayBaseUrl(origin: string = DEFAULT_GATEWAY_ORIGIN): string {
  return `${origin.replace(/\/$/, "")}${GATEWAY_APP_MOUNT}`;
}

// Deterministic out-of-corpus and in-corpus probes.
export const OUT_OF_CORPUS_QUESTION = "who will win the next presidential election";
export const IN_CORPUS_QUESTION = "neural networks transformer edge computing";

export interface SmokeOptions {
  expectedSha?: string | null;
  fetchImpl: FetchLike;
  timeoutMs?: number;
  // Optional second base URL (typically direct origin) used to assert that
  // gateway-facing core payload facts remain parity-consistent.
  parityBaseUrl?: string | null;
  // STE-K-11: the committed corpus-manifest.json contract, injected by
  // the CLI (fs read stays out of the pure contract logic). When null
  // the corpus_manifest_truth contract fails honestly.
  committedManifest?: CorpusManifestContract | null;
  // STE-K-19: when the operator asserts what the deployment's rate-limit
  // backing store SHOULD be (POSTGRES_PERSISTED on a DB-backed deploy),
  // the measured disclosure must match it or the contract breaches.
  expectedRatePersistence?: string | null;
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<{ status: number; body: unknown; raw: string }> {
  const res = await fetchImpl(url);
  const raw = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  return { status: res.status, body, raw };
}

export async function runSmoke(baseUrl: string, opts: SmokeOptions): Promise<SmokeReport> {
  const {
    fetchImpl,
    expectedSha = null,
    committedManifest = null,
    expectedRatePersistence = null,
    parityBaseUrl = null,
  } = opts;
  const base = baseUrl.replace(/\/$/, "");
  const parityBase = parityBaseUrl?.trim() ? parityBaseUrl.replace(/\/$/, "") : null;
  const contracts: ContractResult[] = [];
  const leaks: string[] = [];
  let deployFresh = false;
  let truthLedgerTotalCountFromSummary: number | undefined = undefined;
  let truthLedgerSummaryFromSelfVerify:
    | {
        state?: string;
        persistence?: string;
        count?: number;
        latestFingerprint?: string | null;
        capturedAt?: string | null;
        claimsMeasured?: number | null;
        claimsAsserted?: number | null;
        drift?: boolean;
        retention?: {
          keep?: number;
          oldestRetainedId?: number | null;
          oldestRetainedIsGenesis?: boolean;
        };
      }
    | undefined = undefined;
  // STE-P-290: bridgeRuntime captured from selfVerify (contract 2) and fed
  // to the bridge_surfaces_read cross-surface identity check — no extra fetch.
  let bridgeRuntimeFromSelfVerify: BridgeRuntimeCrossSurface | undefined = undefined;
  // STE-P-291: manifest sha256/docCount captured from corpusQuery.manifest
  // (contract 7) and fed to the same cross-surface identity check.
  let corpusManifestFromContract: CorpusManifestCrossSurface | undefined = undefined;

  function mergeParity(contract: ContractResult, mismatch: string | null): ContractResult {
    if (!mismatch || !contract.passed) return contract;
    return {
      name: contract.name,
      passed: false,
      detail: `${contract.detail}; gateway/direct parity mismatch: ${mismatch}`,
    };
  }

  // 1) /health
  {
    const { status, body, raw } = await getJson(fetchImpl, `${base}/health`);
    const healthBody = (body ?? {}) as { commit?: string };
    let contract = checkHealth(status, healthBody as never, expectedSha, Date.now());
    if (parityBase) {
      let mismatch: string | null = null;
      try {
        const { status: parityStatus, body: parityBody } = await getJson(fetchImpl, `${parityBase}/health`);
        const peer = (parityBody ?? {}) as { status?: string; env?: string; commit?: string };
        if (parityStatus !== 200) mismatch = `direct /health returned ${parityStatus}`;
        else if (!commitMatches(healthBody.commit, peer.commit))
          mismatch = `commit gateway=${String(healthBody.commit)} direct=${String(peer.commit)}`;
        else if (String((healthBody as { status?: string }).status) !== String(peer.status))
          mismatch = `status gateway=${String((healthBody as { status?: string }).status)} direct=${String(peer.status)}`;
        else if (String((healthBody as { env?: string }).env) !== String(peer.env))
          mismatch = `env gateway=${String((healthBody as { env?: string }).env)} direct=${String(peer.env)}`;
      } catch (error) {
        mismatch = `direct /health fetch failed (${error instanceof Error ? error.message : String(error)})`;
      }
      contract = mergeParity(contract, mismatch);
    }
    contracts.push(contract);
    // Freshness signal for the corpus manifest contract: the live
    // commit is confirmed to equal EXPECT_COMMIT.
    deployFresh = !!expectedSha && commitMatches(healthBody.commit, expectedSha);
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`health:${leak}`);
  }

  // 2) onx.selfVerify — honest status surface
  {
    const { status, body, raw } = await getJson(fetchImpl, trpcGetUrl(base, "onx.selfVerify"));
    const schedulerStatusResponse = await getJson(fetchImpl, trpcGetUrl(base, "scheduler.status"));
    const schedulerStatusUnwrapped = unwrapTrpc(schedulerStatusResponse.body);
    const u = unwrapTrpc(body);
    const selfVerifyData = (u.data ?? {}) as {
      truthLedgerSummary?: {
        state?: string;
        persistence?: string;
        count?: number;
        latestFingerprint?: string | null;
        capturedAt?: string | null;
        claimsMeasured?: number | null;
        claimsAsserted?: number | null;
        drift?: boolean;
        retention?: {
          keep?: number;
          oldestRetainedId?: number | null;
          oldestRetainedIsGenesis?: boolean;
        };
      };
      bridgeRuntime?: BridgeRuntimeCrossSurface;
    };
    const schedulerRows = Array.isArray(schedulerStatusUnwrapped.data)
      ? (schedulerStatusUnwrapped.data as Array<{
          active?: boolean;
          interval?: number;
          intervalHuman?: string;
          lastRun?: string | null;
          nextRun?: string | null;
          msUntilNext?: number | null;
          runCount?: number;
          status?: string;
        }>)
      : undefined;
    let contract = checkSelfVerify(
      status,
      selfVerifyData as never,
      { status: schedulerStatusResponse.status, rows: schedulerRows },
    );
    if (parityBase) {
      let mismatch: string | null = null;
      try {
        const { status: parityStatus, body: parityBody } = await getJson(
          fetchImpl,
          trpcGetUrl(parityBase, "onx.selfVerify"),
        );
        const parityUnwrapped = unwrapTrpc(parityBody);
        const peer = (parityUnwrapped.data ?? {}) as {
          truthLedgerSummary?: { count?: number };
          fingerprint?: string;
        };
        if (parityStatus !== 200) mismatch = `direct onx.selfVerify returned ${parityStatus}`;
        else if (String((selfVerifyData as { fingerprint?: string }).fingerprint) !== String(peer.fingerprint))
          mismatch = `fingerprint gateway=${String((selfVerifyData as { fingerprint?: string }).fingerprint).slice(0, 12)} direct=${String(peer.fingerprint).slice(0, 12)}`;
        else if (
          Number(selfVerifyData?.truthLedgerSummary?.count) !== Number(peer?.truthLedgerSummary?.count)
        ) mismatch =
            `truthLedgerSummary.count gateway=${String(selfVerifyData?.truthLedgerSummary?.count)} direct=${String(peer?.truthLedgerSummary?.count)}`;
      } catch (error) {
        mismatch = `direct onx.selfVerify fetch failed (${error instanceof Error ? error.message : String(error)})`;
      }
      contract = mergeParity(contract, mismatch);
    }
    contracts.push(contract);
    truthLedgerTotalCountFromSummary = selfVerifyData?.truthLedgerSummary?.count;
    truthLedgerSummaryFromSelfVerify = selfVerifyData?.truthLedgerSummary;
    bridgeRuntimeFromSelfVerify = selfVerifyData?.bridgeRuntime;
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`selfVerify:${leak}`);
  }

  // 3) providers.status — public read carries the rate-limit disclosure
  // STE-P-294: the served rateLimit is captured here and fed to the two
  // ask.onx contracts for cross-surface identity (same limiter source).
  let rateLimitFromProviders: AskCrossSurface["rateLimit"] = undefined;
  {
    const { status, body, raw } = await getJson(fetchImpl, trpcGetUrl(base, "providers.status"));
    const u = unwrapTrpc(body);
    contracts.push(checkRateDisclosure(status, (u.data ?? {}) as never, expectedRatePersistence ?? undefined));
    const served = (u.data ?? {}) as {
      rateLimit?: { persistence?: string; limit?: number; category?: string };
    };
    if (served.rateLimit) rateLimitFromProviders = served.rateLimit;
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`providers.status:${leak}`);
  }

  // 4) ask.onx — honest refusal for an out-of-corpus question
  // STE-P-294: cross-surface identity — rateLimit vs providers.status,
  // truthDisclosure corpus count vs the committed manifest docCount.
  let refusalTruthDisclosure: string | undefined = undefined;
  {
    const url = trpcGetUrl(base, "ask.onx", { question: OUT_OF_CORPUS_QUESTION, topK: 5 });
    const { status, body, raw } = await getJson(fetchImpl, url);
    const u = unwrapTrpc(body);
    const askData = (u.data ?? {}) as { truthDisclosure?: string };
    contracts.push(
      checkAskRefusal(status, askData as never, {
        rateLimit: rateLimitFromProviders,
        committedDocCount: committedManifest?.docCount,
      }),
    );
    if (typeof askData.truthDisclosure === "string")
      refusalTruthDisclosure = askData.truthDisclosure;
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`ask.refusal:${leak}`);
  }

  // 5) ask.onx — cited answer for an in-corpus question
  // STE-P-294: adds byte-identity of the truthDisclosure prose against
  // the refusal surface (same composer → identical disclosure).
  {
    const url = trpcGetUrl(base, "ask.onx", { question: IN_CORPUS_QUESTION, topK: 5 });
    const { status, body, raw } = await getJson(fetchImpl, url);
    const u = unwrapTrpc(body);
    contracts.push(
      checkAskCited(status, (u.data ?? {}) as never, {
        rateLimit: rateLimitFromProviders,
        committedDocCount: committedManifest?.docCount,
        peerTruthDisclosure: refusalTruthDisclosure,
      }),
    );
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`ask.cited:${leak}`);
  }

  // 6) bridge fail-closed — ingest without a key must be rejected
  {
    const res = await fetchImpl(`${base}/api/trpc/corpusQuery.ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: trpcBody({ units: [{ domain: "SCIENCE", title: "x", body: "y", source: "z" }] }),
    });
    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    contracts.push(checkBridgeFailClosed(res.status, unwrapTrpc(parsed)));
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`bridge:${leak}`);
  }

  // 7) corpusQuery.manifest — the DEPLOYED corpus content manifest must
  // match the committed contract corpus-manifest.json (STE-K-11).
  {
    const { status, body, raw } = await getJson(fetchImpl, trpcGetUrl(base, "corpusQuery.manifest"));
    const u = unwrapTrpc(body);
    const manifestData = (u.data ?? {}) as { sha256?: string; docCount?: number };
    contracts.push(
      checkCorpusManifestTruth(status, manifestData as never, committedManifest, deployFresh),
    );
    // STE-P-291: keep the served manifest identity for the cross-surface
    // check in contract #9 (zero extra requests).
    corpusManifestFromContract = { sha256: manifestData?.sha256, docCount: manifestData?.docCount };
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`corpusQuery.manifest:${leak}`);
  }

  // 8) onx.truthHistory — the truth-ledger read surface (STE-K-13).
  // Empty remains a named honest state; when populated, latest capture
  // freshness is enforced against the measured hourly cadence (STE-K-49).
  {
    const truthHistoryLimit = 20;
    const { status, body, raw } = await getJson(
      fetchImpl,
      trpcGetUrl(base, "onx.truthHistory", { limit: truthHistoryLimit }),
    );
    const u = unwrapTrpc(body);
    const truthData = (u.data ?? {}) as {
      count?: number;
      snapshots?: Array<{ fingerprint?: string }>;
    };
    let contract = checkTruthLedgerRead(
      status,
      truthData as never,
      truthLedgerTotalCountFromSummary,
      Date.now(),
      truthHistoryLimit,
      truthLedgerSummaryFromSelfVerify,
    );
    if (parityBase) {
      let mismatch: string | null = null;
      try {
        const { status: parityStatus, body: parityBody } = await getJson(
          fetchImpl,
          trpcGetUrl(parityBase, "onx.truthHistory", { limit: truthHistoryLimit }),
        );
        const parityUnwrapped = unwrapTrpc(parityBody);
        const peer = (parityUnwrapped.data ?? {}) as {
          count?: number;
          snapshots?: Array<{ fingerprint?: string }>;
        };
        if (parityStatus !== 200) mismatch = `direct onx.truthHistory returned ${parityStatus}`;
        else if (Number(truthData.count) !== Number(peer.count))
          mismatch = `window count gateway=${String(truthData.count)} direct=${String(peer.count)}`;
        else {
          const gwLatest = truthData.snapshots?.[0]?.fingerprint ?? "none";
          const directLatest = peer.snapshots?.[0]?.fingerprint ?? "none";
          if (String(gwLatest) !== String(directLatest))
            mismatch = `latest fingerprint gateway=${String(gwLatest).slice(0, 12)} direct=${String(directLatest).slice(0, 12)}`;
        }
      } catch (error) {
        mismatch = `direct onx.truthHistory fetch failed (${error instanceof Error ? error.message : String(error)})`;
      }
      contract = mergeParity(contract, mismatch);
    }
    contracts.push(contract);
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`onx.truthHistory:${leak}`);
  }

  // 9) onx.bridgeSurfaces — the aggregated public bridge proof consumed by
  // the /truth page (STE-P-287 surface + P288 UI). NEW 10th contract
  // (STE-P-289): the aggregate checksum is RECOMPUTED from the served
  // per-bridge parts via the shared canonical helper — never trusted.
  // STE-P-290 deepening: the titanBridge part is checked for CROSS-SURFACE
  // IDENTITY against selfVerify.bridgeRuntime captured in contract 2.
  // STE-P-291 deepening: the corpusQuery part is checked for CROSS-SURFACE
  // IDENTITY against corpusQuery.manifest captured in contract 7.
  {
    const { status, body, raw } = await getJson(fetchImpl, trpcGetUrl(base, "onx.bridgeSurfaces"));
    const u = unwrapTrpc(body);
    const bridgeData = (u.data ?? {}) as Parameters<typeof checkBridgeSurfacesRead>[1];
    let contract = checkBridgeSurfacesRead(
      status,
      bridgeData,
      bridgeRuntimeFromSelfVerify,
      corpusManifestFromContract,
    );
    if (parityBase) {
      let mismatch: string | null = null;
      try {
        const { status: parityStatus, body: parityBody } = await getJson(
          fetchImpl,
          trpcGetUrl(parityBase, "onx.bridgeSurfaces"),
        );
        const parityUnwrapped = unwrapTrpc(parityBody);
        const peer = (parityUnwrapped.data ?? {}) as { checksum?: string };
        if (parityStatus !== 200) mismatch = `direct onx.bridgeSurfaces returned ${parityStatus}`;
        else if (String(bridgeData?.checksum) !== String(peer?.checksum))
          mismatch = `aggregate checksum gateway=${String(bridgeData?.checksum).slice(0, 12)} direct=${String(peer?.checksum).slice(0, 12)}`;
      } catch (error) {
        mismatch = `direct onx.bridgeSurfaces fetch failed (${error instanceof Error ? error.message : String(error)})`;
      }
      contract = mergeParity(contract, mismatch);
    }
    contracts.push(contract);
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`onx.bridgeSurfaces:${leak}`);
  }

  // 10) /truth — the public human-readable truth page (STE-K-17). It is
  // rendered ENTIRELY from the honest surfaces already checked above, so
  // its own bytes must also never echo a full provider key. A single GET
  // of the served HTML feeds the same leak guard (deep-link SPA route).
  //
  // STE-K-25 DEEPENING (no new contract, total stays 9): a bare `200 OK`
  // shell would pass a leak-only scan while proving nothing was rendered.
  // We therefore also require RENDER PROOF — the served bytes must be the
  // real built SPA shell (SPA root + built module bundle), measured from
  // the live index.html. A hollow/error shell fails HONESTLY here instead
  // of masquerading as a live page. Folded into the same no_key_leak
  // contract's pass/fail so the surface count is unchanged.
  {
    const res = await fetchImpl(`${base}/truth`, { headers: { accept: "text/html" } });
    const raw = await res.text();
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`truthPage:${leak}`);
    const notRendered = assertTruthPageRendered(res.status, raw);
    if (notRendered) leaks.push(`truthPage:not-rendered (${notRendered})`);
  }

  // Leak guard + /truth render proof are a single contract (STE-K-25).
  contracts.push({
    name: "no_key_leak",
    passed: leaks.length === 0,
    detail:
      leaks.length === 0
        ? "no full provider key in any response; /truth render-proven (SPA root + built bundle)"
        : leaks.join("; "),
  });

  const failedCount = contracts.filter((c) => !c.passed).length;
  return {
    harness: "LIVE_SMOKE_DETERMINISTIC",
    baseUrl: base,
    expectedSha,
    startedAt: new Date().toISOString(),
    total: contracts.length,
    passedCount: contracts.length - failedCount,
    failedCount,
    passed: failedCount === 0,
    contracts,
  };
}
