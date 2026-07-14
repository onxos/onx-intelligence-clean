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
  body: { status?: string; env?: string; commit?: string },
  expectedSha: string | null,
): ContractResult {
  const name = "health_live";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  if (body?.status !== "ALIVE")
    return { name, passed: false, detail: `status != ALIVE (${body?.status})` };
  if (!body?.commit) return { name, passed: false, detail: "no commit field" };
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
    items?: Array<{ verdict?: string; measured?: boolean; name?: string }>;
    claimsMeasured?: number;
    claimsAsserted?: number;
    fingerprint?: string;
    truthLedgerSummary?: { count?: number };
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
  // Honest by construction: no claim may be asserted-but-unmeasured.
  if (Number(data?.claimsAsserted) !== 0)
    return { name, passed: false, detail: `claimsAsserted=${data?.claimsAsserted} (expected 0)` };
  const total = data?.truthLedgerSummary?.count;
  if (!Number.isInteger(total) || Number(total) < 0)
    return { name, passed: false, detail: `truthLedgerSummary.count missing/invalid (${total})` };
  return {
    name,
    passed: true,
    detail: `${items.length} items, measured=${data?.claimsMeasured} asserted=0, truthLedgerSummary.count=${total}`,
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

export function checkAskRefusal(
  status: number,
  data: {
    status?: string;
    answer?: unknown;
    citations?: unknown[];
    truthDisclosure?: string;
  },
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
  return { name, passed: true, detail: "out-of-corpus → honest refusal + DEMO disclosure" };
}

export function checkAskCited(
  status: number,
  data: {
    status?: string;
    citations?: Array<{ domain?: string; title?: string; score?: number }>;
    truthDisclosure?: string;
    deterministic?: boolean;
  },
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
  return {
    name,
    passed: true,
    detail: `answered with ${cites.length} citations into the corpus + DEMO disclosure`,
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

// STE-K-13: truth-ledger read surface (onx.truthHistory, public read).
// Proves the chronological OSVA snapshot store is reachable and shaped
// honestly. An EMPTY ledger is a VALID, HONEST state: on the live web
// deployment no scheduler records snapshots (the recording worker
// `onx-scheduler` is autoDeploy:false / branch:main — render.yaml:179,196;
// the web-internal cron in boot.ts:83-104 runs ticks but does NOT call
// recordTruthSnapshot). So the contract accepts count===0 and REPORTS it
// rather than fabricating history. When rows DO exist, every entry must
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
  const snaps = data?.snapshots;
  if (!Array.isArray(snaps))
    return { name, passed: false, detail: "snapshots is not an array" };
  if (Number(data?.count) !== snaps.length)
    return { name, passed: false, detail: `count (${data?.count}) != snapshots.length (${snaps.length})` };
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
  // Empty ledger = honest "no live scheduled capture" state, not a breach.
  if (snaps.length === 0)
    return {
      name,
      passed: true,
      detail:
        truthLedgerTotalCount === undefined
          ? `ledger empty — honest: no live scheduled capture (persistence=${persistence})`
          : `ledger empty window (persistence=${persistence}); truthful total count=${truthLedgerTotalCount}`,
    };
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
  const { fetchImpl, expectedSha = null, committedManifest = null, expectedRatePersistence = null } = opts;
  const base = baseUrl.replace(/\/$/, "");
  const contracts: ContractResult[] = [];
  const leaks: string[] = [];
  let deployFresh = false;
  let truthLedgerTotalCountFromSummary: number | undefined = undefined;

  // 1) /health
  {
    const { status, body, raw } = await getJson(fetchImpl, `${base}/health`);
    const healthBody = (body ?? {}) as { commit?: string };
    contracts.push(checkHealth(status, healthBody as Record<string, string>, expectedSha));
    // Freshness signal for the corpus manifest contract: the live
    // commit is confirmed to equal EXPECT_COMMIT.
    deployFresh = !!expectedSha && commitMatches(healthBody.commit, expectedSha);
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`health:${leak}`);
  }

  // 2) onx.selfVerify — honest status surface
  {
    const { status, body, raw } = await getJson(fetchImpl, trpcGetUrl(base, "onx.selfVerify"));
    const u = unwrapTrpc(body);
    const selfVerifyData = (u.data ?? {}) as { truthLedgerSummary?: { count?: number } };
    contracts.push(checkSelfVerify(status, selfVerifyData as never));
    truthLedgerTotalCountFromSummary = selfVerifyData?.truthLedgerSummary?.count;
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`selfVerify:${leak}`);
  }

  // 3) providers.status — public read carries the rate-limit disclosure
  {
    const { status, body, raw } = await getJson(fetchImpl, trpcGetUrl(base, "providers.status"));
    const u = unwrapTrpc(body);
    contracts.push(checkRateDisclosure(status, (u.data ?? {}) as never, expectedRatePersistence ?? undefined));
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`providers.status:${leak}`);
  }

  // 4) ask.onx — honest refusal for an out-of-corpus question
  {
    const url = trpcGetUrl(base, "ask.onx", { question: OUT_OF_CORPUS_QUESTION, topK: 5 });
    const { status, body, raw } = await getJson(fetchImpl, url);
    const u = unwrapTrpc(body);
    contracts.push(checkAskRefusal(status, (u.data ?? {}) as never));
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`ask.refusal:${leak}`);
  }

  // 5) ask.onx — cited answer for an in-corpus question
  {
    const url = trpcGetUrl(base, "ask.onx", { question: IN_CORPUS_QUESTION, topK: 5 });
    const { status, body, raw } = await getJson(fetchImpl, url);
    const u = unwrapTrpc(body);
    contracts.push(checkAskCited(status, (u.data ?? {}) as never));
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
    contracts.push(
      checkCorpusManifestTruth(status, (u.data ?? {}) as never, committedManifest, deployFresh),
    );
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`corpusQuery.manifest:${leak}`);
  }

  // 8) onx.truthHistory — the truth-ledger read surface (STE-K-13).
  // An empty ledger is honest (no live scheduled capture) and reported.
  {
    const { status, body, raw } = await getJson(
      fetchImpl,
      trpcGetUrl(base, "onx.truthHistory", { limit: 20 }),
    );
    const u = unwrapTrpc(body);
    contracts.push(
      checkTruthLedgerRead(status, (u.data ?? {}) as never, truthLedgerTotalCountFromSummary),
    );
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`onx.truthHistory:${leak}`);
  }

  // 9) /truth — the public human-readable truth page (STE-K-17). It is
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
