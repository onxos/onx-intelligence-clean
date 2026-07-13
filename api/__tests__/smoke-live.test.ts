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
  checkCorpusManifestTruth,
  checkTruthLedgerRead,
  commitMatches,
  unwrapTrpc,
  trpcGetUrl,
  assertNoKeyLeak,
  OUT_OF_CORPUS_QUESTION,
  IN_CORPUS_QUESTION,
  type FetchLike,
  type SmokeResponse,
  type CorpusManifestContract,
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
const MANIFEST_DOMAINS = [
  "AGRICULTURE", "DEFENSE", "ECONOMICS", "EDUCATION", "ENERGY", "ENGINEERING",
  "ENVIRONMENT", "FINANCE", "HISTORY", "ISLAMIC", "LEGAL", "MANUFACTURING",
  "MEDIA", "MEDICINE", "SCIENCE", "SOCIAL", "STRATEGY", "TECHNOLOGY", "TRANSPORTATION",
];
const MANIFEST_SHA = "6fc2bed87d86e4cfc195020cd34c148cee96348797b413bba60baac7c3372f08";
const LIVE_MANIFEST = {
  bridge: "corpusQuery",
  access: "PUBLIC_READ",
  version: "1",
  source: "templated seed (ONX Knowledge Base v1.0)",
  docCount: 22500,
  domains: MANIFEST_DOMAINS,
  provenance: "TEMPLATED_SEED",
  disclosure: "DEMO",
  templatedDocs: 22500,
  authenticDocs: 0,
  sha256: MANIFEST_SHA,
};
const COMMITTED_MANIFEST: CorpusManifestContract = {
  disclosure: "DEMO",
  provenance: "TEMPLATED_SEED",
  docCount: 22500,
  domains: MANIFEST_DOMAINS,
  sha256: MANIFEST_SHA,
};

// Truth-ledger read surface. Live production returns an EMPTY ledger
// (no scheduled capture on the web deploy) — the honest default here.
const LEDGER_FP_A = "a".repeat(64);
const LEDGER_FP_B = "b".repeat(64);
const LIVE_TRUTH_HISTORY_EMPTY = {
  rateLimit: { limit: 60, remaining: 59, category: "PUBLIC_READ", persistence: "PER_INSTANCE_UNPERSISTED" },
  persistence: "POSTGRES",
  count: 0,
  snapshots: [] as Array<Record<string, unknown>>,
};
const LIVE_TRUTH_HISTORY_POPULATED = {
  rateLimit: { limit: 60, remaining: 59, category: "PUBLIC_READ", persistence: "PER_INSTANCE_UNPERSISTED" },
  persistence: "UNPERSISTED",
  count: 2,
  snapshots: [
    { id: 2, fingerprint: LEDGER_FP_B, claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-02T00:00:00.000Z", drift: true },
    { id: 1, fingerprint: LEDGER_FP_A, claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false },
  ],
};

// A full honest-live fetch double routing by URL.
function liveFetch(overrides: Partial<Record<string, SmokeResponse>> = {}): FetchLike {
  return async (url, init) => {
    if (url.endsWith("/health")) return overrides.health ?? resp(200, LIVE_HEALTH);
    if (url.includes("onx.selfVerify")) return overrides.selfVerify ?? trpcOk(LIVE_SELFVERIFY);
    if (url.includes("providers.status")) return overrides.providers ?? trpcOk(LIVE_PROVIDERS);
    if (url.includes("corpusQuery.manifest")) return overrides.manifest ?? trpcOk(LIVE_MANIFEST);
    if (url.includes("onx.truthHistory")) return overrides.truthHistory ?? trpcOk(LIVE_TRUTH_HISTORY_EMPTY);
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

  it("commitMatches accepts full/prefix, rejects mismatch/empty", () => {
    expect(commitMatches("810700e2bdee", "810700e")).toBe(true);
    expect(commitMatches("810700e", "810700e2bdee")).toBe(true);
    expect(commitMatches("810700e", "810700e")).toBe(true);
    expect(commitMatches("810700e", "deadbeef")).toBe(false);
    expect(commitMatches(undefined, "x")).toBe(false);
    expect(commitMatches("x", undefined)).toBe(false);
  });

  it("corpus manifest truth passes when live sha256 matches committed", () => {
    const r = checkCorpusManifestTruth(200, LIVE_MANIFEST, COMMITTED_MANIFEST, true);
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/identical/);
  });
  it("corpus manifest truth FAILS on sha mismatch when deploy is fresh (real breach)", () => {
    const r = checkCorpusManifestTruth(
      200, { ...LIVE_MANIFEST, sha256: "b".repeat(64) }, COMMITTED_MANIFEST, true,
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/MISMATCH on a confirmed-fresh deploy/);
  });
  it("corpus manifest truth passes PENDING on sha mismatch when deploy is not fresh (honest lag)", () => {
    const r = checkCorpusManifestTruth(
      200, { ...LIVE_MANIFEST, sha256: "b".repeat(64) }, COMMITTED_MANIFEST, false,
    );
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/PENDING/);
  });
  it("corpus manifest truth FAILS on structural drift regardless of freshness", () => {
    expect(checkCorpusManifestTruth(200, { ...LIVE_MANIFEST, docCount: 22499 }, COMMITTED_MANIFEST, false).passed).toBe(false);
    expect(checkCorpusManifestTruth(200, { ...LIVE_MANIFEST, disclosure: "REAL" }, COMMITTED_MANIFEST, false).passed).toBe(false);
    expect(checkCorpusManifestTruth(200, { ...LIVE_MANIFEST, provenance: "AUTHENTIC_INGEST" }, COMMITTED_MANIFEST, false).passed).toBe(false);
    expect(checkCorpusManifestTruth(200, { ...LIVE_MANIFEST, domains: MANIFEST_DOMAINS.slice(1) }, COMMITTED_MANIFEST, false).passed).toBe(false);
  });
  it("corpus manifest truth fails on non-200, non-hex sha, or missing committed", () => {
    expect(checkCorpusManifestTruth(503, LIVE_MANIFEST, COMMITTED_MANIFEST, true).passed).toBe(false);
    expect(checkCorpusManifestTruth(200, { ...LIVE_MANIFEST, sha256: "nope" }, COMMITTED_MANIFEST, true).passed).toBe(false);
    expect(checkCorpusManifestTruth(200, LIVE_MANIFEST, null, true).passed).toBe(false);
  });
});

describe("runSmoke orchestration (mocked fetch)", () => {
  it("all contracts pass on an honest live service", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch(),
      expectedSha: "810700e",
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(true);
    expect(report.failedCount).toBe(0);
    expect(report.total).toBe(9); // 8 contracts + no_key_leak guard
    expect(report.contracts.map((c) => c.name)).toContain("corpus_manifest_truth");
    expect(report.contracts.map((c) => c.name)).toContain("truth_ledger_read");
    expect(report.contracts.map((c) => c.name)).toContain("no_key_leak");
  });

  it("is deterministic: two runs produce identical contract verdicts", async () => {
    const opts = { fetchImpl: liveFetch(), expectedSha: null, committedManifest: COMMITTED_MANIFEST };
    const a = await runSmoke("https://x.dev", opts);
    const b = await runSmoke("https://x.dev", opts);
    const strip = (r: Awaited<ReturnType<typeof runSmoke>>) =>
      r.contracts.map((c) => ({ name: c.name, passed: c.passed, detail: c.detail }));
    expect(strip(a)).toEqual(strip(b));
  });

  it("fails overall when the deployed commit does not match expected", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch(),
      expectedSha: "deadbeef",
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "health_live")?.passed).toBe(false);
  });

  it("corpus_manifest_truth FAILS overall when the live manifest sha drifts on a fresh deploy", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ manifest: trpcOk({ ...LIVE_MANIFEST, sha256: "c".repeat(64) }) }),
      expectedSha: "810700e", // matches LIVE_HEALTH commit → deploy fresh
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "corpus_manifest_truth")?.passed).toBe(false);
  });

  it("corpus_manifest_truth passes PENDING when sha drifts but no EXPECT_COMMIT (freshness unknown)", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ manifest: trpcOk({ ...LIVE_MANIFEST, sha256: "c".repeat(64) }) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "corpus_manifest_truth");
    expect(c?.passed).toBe(true);
    expect(c?.detail).toMatch(/PENDING/);
  });

  it("fails when a full provider key leaks in a response", async () => {
    const leaky = trpcOk({
      ...LIVE_PROVIDERS,
      providers: [{ id: "openai", key: "sk-abcdefghijklmnopqrstuvwxyz012345" }],
    });
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ providers: leaky }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "no_key_leak")?.passed).toBe(false);
  });

  it("fails when the bridge is OPEN (mutation succeeds without a key)", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ bridge: trpcOk({ accepted: 1, duplicates: 0 }) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "bridge_fail_closed")?.passed).toBe(false);
  });

  it("fails when ask.onx answers an out-of-corpus question instead of refusing", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ askRefusal: trpcOk({ ...LIVE_ASK_REFUSAL, status: "ANSWERED", answer: "x" }) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "ask_onx_honest_refusal")?.passed).toBe(false);
  });

  it("truth_ledger_read passes on an honest EMPTY live ledger (no scheduled capture)", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch(),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "truth_ledger_read");
    expect(c?.passed).toBe(true);
    expect(c?.detail).toMatch(/empty/);
  });

  it("truth_ledger_read passes on a populated ledger and surfaces drift flags", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ truthHistory: trpcOk(LIVE_TRUTH_HISTORY_POPULATED) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "truth_ledger_read");
    expect(c?.passed).toBe(true);
    expect(c?.detail).toMatch(/2 snapshots, 1 drift-flagged/);
  });

  it("probes distinct in/out-of-corpus questions", () => {
    expect(OUT_OF_CORPUS_QUESTION).not.toEqual(IN_CORPUS_QUESTION);
  });
});

describe("checkTruthLedgerRead (STE-K-13)", () => {
  it("accepts an empty ledger as an honest state", () => {
    const r = checkTruthLedgerRead(200, { persistence: "POSTGRES", count: 0, snapshots: [] });
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/honest/);
  });

  it("accepts a well-formed populated ledger and counts drift", () => {
    const r = checkTruthLedgerRead(200, LIVE_TRUTH_HISTORY_POPULATED);
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/1 drift-flagged/);
  });

  it("fails on non-200", () => {
    expect(checkTruthLedgerRead(503, { persistence: "POSTGRES", count: 0, snapshots: [] }).passed).toBe(false);
  });

  it("fails on an unknown persistence label", () => {
    expect(checkTruthLedgerRead(200, { persistence: "MYSTERY", count: 0, snapshots: [] }).passed).toBe(false);
  });

  it("fails when count disagrees with snapshots length", () => {
    expect(checkTruthLedgerRead(200, { persistence: "POSTGRES", count: 5, snapshots: [] }).passed).toBe(false);
  });

  it("fails on a snapshot with a non-sha256 fingerprint", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "UNPERSISTED",
      count: 1,
      snapshots: [{ id: 1, fingerprint: "nope", claimsMeasured: 1, claimsAsserted: 0, drift: false }],
    });
    expect(r.passed).toBe(false);
  });

  it("fails on a snapshot missing the boolean drift flag", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "UNPERSISTED",
      count: 1,
      snapshots: [{ id: 1, fingerprint: "a".repeat(64), claimsMeasured: 1, claimsAsserted: 0 }],
    });
    expect(r.passed).toBe(false);
  });

  // STE-K-15: drift-over-time integrity (>=2 snapshots).
  it("fails on a FABRICATED drift flag that contradicts the fingerprint comparison", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 2,
      snapshots: [
        // fingerprints differ but drift is falsely reported as false
        { id: 2, fingerprint: "b".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-02T00:00:00.000Z", drift: false },
        { id: 1, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/fabricated drift/);
  });

  it("fails when a stable-fingerprint pair falsely claims drift=true", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 2,
      snapshots: [
        { id: 2, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-02T00:00:00.000Z", drift: true },
        { id: 1, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/fabricated drift/);
  });

  it("fails when snapshots are not newest-first by id", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 2,
      snapshots: [
        { id: 1, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false },
        { id: 2, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-02T00:00:00.000Z", drift: false },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/newest-first/);
  });

  it("fails when createdAt precedes its predecessor (out of chronological order)", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 2,
      snapshots: [
        { id: 2, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false },
        { id: 1, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-02T00:00:00.000Z", drift: false },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/out of order/);
  });

  it("passes a well-formed >=2 ledger with a consistent drift flag", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 2,
      snapshots: [
        { id: 2, fingerprint: "b".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-02T00:00:00.000Z", drift: true },
        { id: 1, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false },
      ],
    });
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/1 drift-flagged/);
  });
});
