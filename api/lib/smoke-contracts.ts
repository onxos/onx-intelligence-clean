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

// --- Pure contract evaluators (unit-tested directly) --------

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
  return {
    name,
    passed: true,
    detail: `${items.length} items, measured=${data?.claimsMeasured} asserted=0`,
  };
}

export function checkRateDisclosure(
  status: number,
  data: { rateLimit?: { persistence?: string; limit?: number; category?: string } },
): ContractResult {
  const name = "rate_limit_disclosure";
  if (status !== 200) return { name, passed: false, detail: `expected 200, got ${status}` };
  const rl = data?.rateLimit;
  if (!rl) return { name, passed: false, detail: "no rateLimit disclosure on public read" };
  if (rl.persistence !== "PER_INSTANCE_UNPERSISTED")
    return { name, passed: false, detail: `persistence=${rl.persistence}` };
  return {
    name,
    passed: true,
    detail: `limit=${rl.limit} category=${rl.category} persistence=${rl.persistence} (single call — no flood)`,
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

// Fail-closed proof. The bridge guard throws a plain Error, which
// tRPC maps to INTERNAL_SERVER_ERROR (httpStatus 500) — NOT a 401/403.
// The honest contract is: the mutation is REJECTED (never executed)
// and the error carries a BRIDGE_ marker. We assert reality, not the
// wished status code.
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
  if (status < 400)
    return { name, passed: false, detail: `rejection must be an error status, got ${status}` };
  return {
    name,
    passed: true,
    detail: `rejected (${msg.split(":")[0]}, httpStatus=${unwrapped.error?.httpStatus}) — mutation never ran`,
  };
}

// --- Runner (injectable fetch) ------------------------------

export const DEFAULT_BASE_URL = "https://onx-intelligence-clean.onrender.com";

// Deterministic out-of-corpus and in-corpus probes.
export const OUT_OF_CORPUS_QUESTION = "who will win the next presidential election";
export const IN_CORPUS_QUESTION = "neural networks transformer edge computing";

export interface SmokeOptions {
  expectedSha?: string | null;
  fetchImpl: FetchLike;
  timeoutMs?: number;
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
  const { fetchImpl, expectedSha = null } = opts;
  const base = baseUrl.replace(/\/$/, "");
  const contracts: ContractResult[] = [];
  const leaks: string[] = [];

  // 1) /health
  {
    const { status, body, raw } = await getJson(fetchImpl, `${base}/health`);
    contracts.push(checkHealth(status, (body ?? {}) as Record<string, string>, expectedSha));
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`health:${leak}`);
  }

  // 2) onx.selfVerify — honest status surface
  {
    const { status, body, raw } = await getJson(fetchImpl, trpcGetUrl(base, "onx.selfVerify"));
    const u = unwrapTrpc(body);
    contracts.push(checkSelfVerify(status, (u.data ?? {}) as never));
    const leak = assertNoKeyLeak(raw);
    if (leak) leaks.push(`selfVerify:${leak}`);
  }

  // 3) providers.status — public read carries the rate-limit disclosure
  {
    const { status, body, raw } = await getJson(fetchImpl, trpcGetUrl(base, "providers.status"));
    const u = unwrapTrpc(body);
    contracts.push(checkRateDisclosure(status, (u.data ?? {}) as never));
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

  // Leak guard is itself a contract.
  contracts.push({
    name: "no_key_leak",
    passed: leaks.length === 0,
    detail: leaks.length === 0 ? "no full provider key in any response" : leaks.join("; "),
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
