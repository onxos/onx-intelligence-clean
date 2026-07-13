// ============================================================
// LIVE SMOKE CONTRACT TESTS — STE-K-08
// Deterministic: a MOCKED fetch returns live-shaped responses.
// Zero network. Proves the contract logic (pass on honest live
// shapes, fail on every breach: commit mismatch, key leak, missing
// refusal, empty citations on ANSWERED, open bridge).
// ============================================================
import { describe, it, expect } from "vitest";
import {
  runSmoke,
  checkHealth,
  checkSelfVerify,
  checkRateDisclosure,
  checkAskRefusal,
  checkAskCited,
  checkBridgeFailClosed,
  unwrapTrpc,
  trpcGetUrl,
  assertNoKeyLeak,
  OUT_OF_CORPUS_QUESTION,
  IN_CORPUS_QUESTION,
  type FetchLike,
  type SmokeResponse,
} from "../lib/smoke-contracts";

// ---- helpers to build a live-shaped tRPC fetch double ----

function resp(status: number, body: unknown): SmokeResponse {
  const raw = JSON.stringify(body);
  return {
    status,
    json: async () => JSON.parse(raw),
    text: async () => raw,
  };
}
function trpcOk(value: unknown, status = 200): SmokeResponse {
  return resp(status, { result: { data: { json: value } } });
}
function trpcErr(message: string, httpStatus: number): SmokeResponse {
  return resp(httpStatus, {
    error: { json: { message, code: -32603, data: { httpStatus, code: "INTERNAL_SERVER_ERROR" } } },
  });
}

const COMMIT = "810700e2bdee353947b4460f83200a1274941046";

const LIVE_HEALTH = { status: "ALIVE", env: "production", commit: COMMIT, uptime: 1 };
const LIVE_SELFVERIFY = {
  items: [
    { area: "health", name: "Database", verdict: "IMPLEMENTED_PROVEN", measured: true },
    { area: "corpus", name: "Corpus", verdict: "DEMO", measured: true },
    { area: "providers", name: "openai", verdict: "DOCUMENTED_ONLY", measured: true },
  ],
  claimsMeasured: 19,
  claimsAsserted: 0,
  fingerprint: "a".repeat(64),
};
const LIVE_PROVIDERS = {
  bridge: "providers",
  rateLimit: { limit: 60, remaining: 59, category: "PUBLIC_READ", persistence: "PER_INSTANCE_UNPERSISTED" },
  enabled: true,
  hasSharedSecret: true,
  providers: [{ id: "openai", status: "CONFIGURED_UNPROBED", keyPrefix: "sk-p" }],
};
const LIVE_ASK_REFUSAL = {
  access: "PUBLIC_READ",
  rateLimit: { persistence: "PER_INSTANCE_UNPERSISTED", limit: 60 },
  deterministic: true,
  intent: "INFO",
  confidence: 0.1,
  truthDisclosure: "DEMO: corpus of 22500 synthetic units",
  status: "INSUFFICIENT_EVIDENCE",
  answer: null,
  refusal: "لا دليل كافٍ في الذخيرة",
  citations: [],
};
const LIVE_ASK_CITED = {
  access: "PUBLIC_READ",
  rateLimit: { persistence: "PER_INSTANCE_UNPERSISTED", limit: 60 },
  deterministic: true,
  intent: "INFO",
  confidence: 0.4,
  truthDisclosure: "DEMO: corpus of 22500 synthetic units",
  status: "ANSWERED",
  answer: "…",
  refusal: null,
  citations: [{ id: "u1", domain: "TECHNOLOGY", title: "Neural nets", score: 3.2 }],
};

// A full honest-live fetch double routing by URL.
function liveFetch(overrides: Partial<Record<string, SmokeResponse>> = {}): FetchLike {
  return async (url, init) => {
    if (url.endsWith("/health")) return overrides.health ?? resp(200, LIVE_HEALTH);
    if (url.includes("onx.selfVerify")) return overrides.selfVerify ?? trpcOk(LIVE_SELFVERIFY);
    if (url.includes("providers.status")) return overrides.providers ?? trpcOk(LIVE_PROVIDERS);
    if (url.includes("ask.onx")) {
      const isRefusal = url.includes(encodeURIComponent(OUT_OF_CORPUS_QUESTION.split(" ")[0]));
      if (isRefusal) return overrides.askRefusal ?? trpcOk(LIVE_ASK_REFUSAL);
      return overrides.askCited ?? trpcOk(LIVE_ASK_CITED);
    }
    if (url.includes("corpusQuery.ingest") && init?.method === "POST")
      return overrides.bridge ?? trpcErr("BRIDGE_UNAUTHORIZED: Missing or invalid x-onx-bridge-key", 401);
    throw new Error(`unexpected url ${url}`);
  };
}

describe("smoke-live helpers", () => {
  it("builds superjson-wrapped tRPC query urls", () => {
    const url = trpcGetUrl("https://x.dev", "ask.onx", { question: "hi", topK: 5 });
    expect(url).toContain("/api/trpc/ask.onx?input=");
    const enc = decodeURIComponent(url.split("input=")[1]);
    expect(JSON.parse(enc)).toEqual({ json: { question: "hi", topK: 5 } });
  });

  it("unwraps success and error envelopes", () => {
    expect(unwrapTrpc({ result: { data: { json: { a: 1 } } } })).toEqual({ ok: true, data: { a: 1 } });
    const e = unwrapTrpc({ error: { json: { message: "BRIDGE_UNAUTHORIZED: x", data: { httpStatus: 401 } } } });
    expect(e.ok).toBe(false);
    expect(e.error?.httpStatus).toBe(401);
    expect(e.error?.message).toContain("BRIDGE_");
  });

  it("assertNoKeyLeak flags a full sk- secret but not a short prefix", () => {
    expect(assertNoKeyLeak('{"keyPrefix":"sk-p"}')).toBeNull();
    expect(assertNoKeyLeak('{"key":"sk-abcdefghijklmnopqrstuvwxyz012345"}')).not.toBeNull();
  });
});

describe("smoke-live contract evaluators", () => {
  it("health passes on ALIVE + matching sha (prefix)", () => {
    expect(checkHealth(200, LIVE_HEALTH, "810700e").passed).toBe(true);
    expect(checkHealth(200, LIVE_HEALTH, COMMIT).passed).toBe(true);
    expect(checkHealth(200, LIVE_HEALTH, null).passed).toBe(true);
  });
  it("health fails on wrong status, non-200, or sha mismatch", () => {
    expect(checkHealth(503, LIVE_HEALTH, null).passed).toBe(false);
    expect(checkHealth(200, { status: "DEAD", commit: COMMIT }, null).passed).toBe(false);
    expect(checkHealth(200, LIVE_HEALTH, "deadbeef").passed).toBe(false);
  });

  it("selfVerify passes on five-state verdicts + asserted=0 + sha256 fp", () => {
    expect(checkSelfVerify(200, LIVE_SELFVERIFY).passed).toBe(true);
  });
  it("selfVerify fails on asserted>0, bad verdict, or bad fingerprint", () => {
    expect(checkSelfVerify(200, { ...LIVE_SELFVERIFY, claimsAsserted: 1 }).passed).toBe(false);
    expect(
      checkSelfVerify(200, { ...LIVE_SELFVERIFY, items: [{ verdict: "MADE_UP", measured: true }] }).passed,
    ).toBe(false);
    expect(checkSelfVerify(200, { ...LIVE_SELFVERIFY, fingerprint: "short" }).passed).toBe(false);
  });

  it("rate disclosure passes only on PER_INSTANCE_UNPERSISTED", () => {
    expect(checkRateDisclosure(200, LIVE_PROVIDERS).passed).toBe(true);
    expect(checkRateDisclosure(200, { rateLimit: { persistence: "POSTGRES" } }).passed).toBe(false);
    expect(checkRateDisclosure(200, {}).passed).toBe(false);
  });

  it("ask refusal passes on honest INSUFFICIENT_EVIDENCE + DEMO + no citations", () => {
    expect(checkAskRefusal(200, LIVE_ASK_REFUSAL).passed).toBe(true);
  });
  it("ask refusal fails if it fabricates (citations) or omits DEMO", () => {
    expect(checkAskRefusal(200, { ...LIVE_ASK_REFUSAL, status: "ANSWERED" }).passed).toBe(false);
    expect(checkAskRefusal(200, { ...LIVE_ASK_REFUSAL, citations: [{}] }).passed).toBe(false);
    expect(checkAskRefusal(200, { ...LIVE_ASK_REFUSAL, truthDisclosure: "live corpus" }).passed).toBe(false);
    expect(checkAskRefusal(200, { ...LIVE_ASK_REFUSAL, answer: "x" }).passed).toBe(false);
  });

  it("ask cited passes on ANSWERED + citations + DEMO", () => {
    expect(checkAskCited(200, LIVE_ASK_CITED).passed).toBe(true);
  });
  it("ask cited fails when ANSWERED without citations", () => {
    expect(checkAskCited(200, { ...LIVE_ASK_CITED, citations: [] }).passed).toBe(false);
  });

  it("bridge fail-closed passes on hardened 401/403 BRIDGE_ errors", () => {
    const u401 = unwrapTrpc({ error: { json: { message: "BRIDGE_UNAUTHORIZED: x", data: { httpStatus: 401 } } } });
    const r401 = checkBridgeFailClosed(401, u401);
    expect(r401.passed).toBe(true);
    expect(r401.detail).toMatch(/hardened/);
    const u403 = unwrapTrpc({ error: { json: { message: "BRIDGE_DISABLED: x", data: { httpStatus: 403 } } } });
    expect(checkBridgeFailClosed(403, u403).passed).toBe(true);
  });
  it("bridge fail-closed still passes on a legacy 500 rejection (honest tolerance)", () => {
    const u = unwrapTrpc({ error: { json: { message: "BRIDGE_UNAUTHORIZED: x", data: { httpStatus: 500 } } } });
    const r = checkBridgeFailClosed(500, u);
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/legacy/);
  });
  it("bridge fail-closed FAILS if the mutation succeeded (open bridge)", () => {
    expect(checkBridgeFailClosed(200, { ok: true }).passed).toBe(false);
  });
  it("bridge fail-closed fails if rejected without a BRIDGE_ marker", () => {
    const u = unwrapTrpc({ error: { json: { message: "some parse error", data: { httpStatus: 400 } } } });
    expect(checkBridgeFailClosed(400, u).passed).toBe(false);
  });
});

describe("runSmoke orchestration (mocked fetch)", () => {
  it("all contracts pass on an honest live service", async () => {
    const report = await runSmoke("https://x.dev", { fetchImpl: liveFetch(), expectedSha: "810700e" });
    expect(report.passed).toBe(true);
    expect(report.failedCount).toBe(0);
    expect(report.total).toBe(7); // 6 contracts + no_key_leak guard
    expect(report.contracts.map((c) => c.name)).toContain("no_key_leak");
  });

  it("is deterministic: two runs produce identical contract verdicts", async () => {
    const a = await runSmoke("https://x.dev", { fetchImpl: liveFetch(), expectedSha: null });
    const b = await runSmoke("https://x.dev", { fetchImpl: liveFetch(), expectedSha: null });
    const strip = (r: Awaited<ReturnType<typeof runSmoke>>) =>
      r.contracts.map((c) => ({ name: c.name, passed: c.passed, detail: c.detail }));
    expect(strip(a)).toEqual(strip(b));
  });

  it("fails overall when the deployed commit does not match expected", async () => {
    const report = await runSmoke("https://x.dev", { fetchImpl: liveFetch(), expectedSha: "deadbeef" });
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "health_live")?.passed).toBe(false);
  });

  it("fails when a full provider key leaks in a response", async () => {
    const leaky = trpcOk({
      ...LIVE_PROVIDERS,
      providers: [{ id: "openai", key: "sk-abcdefghijklmnopqrstuvwxyz012345" }],
    });
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ providers: leaky }),
      expectedSha: null,
    });
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "no_key_leak")?.passed).toBe(false);
  });

  it("fails when the bridge is OPEN (mutation succeeds without a key)", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ bridge: trpcOk({ accepted: 1, duplicates: 0 }) }),
      expectedSha: null,
    });
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "bridge_fail_closed")?.passed).toBe(false);
  });

  it("fails when ask.onx answers an out-of-corpus question instead of refusing", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ askRefusal: trpcOk({ ...LIVE_ASK_REFUSAL, status: "ANSWERED", answer: "x" }) }),
      expectedSha: null,
    });
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "ask_onx_honest_refusal")?.passed).toBe(false);
  });

  it("probes distinct in/out-of-corpus questions", () => {
    expect(OUT_OF_CORPUS_QUESTION).not.toEqual(IN_CORPUS_QUESTION);
  });
});
