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
  checkCommitCrossSurface,
  checkSelfVerify,
  checkRateDisclosure,
  checkProvidersCrossSurface,
  checkAskRefusal,
  checkAskCited,
  extractCorpusCountFromDisclosure,
  checkBridgeFailClosed,
  checkBridgeSurfacesRead,
  checkCorpusManifestTruth,
  checkTruthLedgerRead,
  commitMatches,
  unwrapTrpc,
  trpcGetUrl,
  assertNoKeyLeak,
  assertTruthPageRendered,
  gatewayBaseUrl,
  DEFAULT_GATEWAY_ORIGIN,
  GATEWAY_APP_MOUNT,
  OUT_OF_CORPUS_QUESTION,
  IN_CORPUS_QUESTION,
  type FetchLike,
  type SmokeResponse,
  type CorpusManifestContract,
} from "../lib/smoke-contracts";
import { computeBridgeSurfacesChecksum } from "../lib/bridge-surfaces-checksum";
import {
  computeCorpusBridgeChecksum,
  computeIntentBridgeChecksum,
  computeTitanBridgeChecksum,
} from "../lib/bridge-part-checksums";
import { computeSelfVerifyFingerprint } from "../lib/self-verify-fingerprint";

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
function html(status: number, body: string): SmokeResponse {
  return { status, json: async () => ({}), text: async () => body };
}

// The served /truth SPA shell — mirrors the REAL built index.html
// (SPA root + type="module" bundle from /assets/*), with no secrets.
const LIVE_TRUTH_HTML = '<!doctype html><html lang="ar" dir="rtl"><head><title>ONX Intelligence</title><script type="module" crossorigin src="/assets/index-TImycC0a.js"></script></head><body><div id="root"></div></body></html>';

const COMMIT = "810700e2bdee353947b4460f83200a1274941046";

const LIVE_HEALTH = {
  status: "ALIVE",
  env: "production",
  commit: COMMIT,
  uptime: 1,
  bootTime: "2026-01-01T00:00:00.000Z",
  timestamp: "2026-01-01T00:00:00.000Z",
};
// STE-P-295: /commit mirrors /health's process-global deployedCommit()
// and BOOT_TIME (boot.ts:49-56) — cross-surface identity holds by
// default; the divergence tests override it explicitly.
const LIVE_COMMIT = {
  commit: COMMIT,
  service: "onx-intelligence-clean",
  bootTime: "2026-01-01T00:00:00.000Z",
  timestamp: "2026-01-01T00:00:00.000Z",
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
  rateLimit: { limit: 60, remaining: 58, category: "PUBLIC_READ", persistence: "PER_INSTANCE_UNPERSISTED" },
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
  rateLimit: { limit: 60, remaining: 57, category: "PUBLIC_READ", persistence: "PER_INSTANCE_UNPERSISTED" },
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

// Truth-ledger read surface fixtures.
const LEDGER_FP_A = "a".repeat(64);
const LEDGER_FP_B = "b".repeat(64);
const LEDGER_NOW_MS = Date.now();
const LEDGER_TS_NEW = new Date(LEDGER_NOW_MS - (30 * 60 * 1000)).toISOString();
const LEDGER_TS_OLD = new Date(LEDGER_NOW_MS - (90 * 60 * 1000)).toISOString();
const LIVE_TRUTH_HISTORY_EMPTY = {
  rateLimit: { limit: 60, remaining: 59, category: "PUBLIC_READ", persistence: "PER_INSTANCE_UNPERSISTED" },
  persistence: "POSTGRES",
  count: 0,
  snapshots: [] as Array<Record<string, unknown>>,
  retention: { keep: 168, oldestRetainedId: null, oldestRetainedIsGenesis: false },
};
const LIVE_TRUTH_HISTORY_POPULATED = {
  rateLimit: { limit: 60, remaining: 59, category: "PUBLIC_READ", persistence: "PER_INSTANCE_UNPERSISTED" },
  persistence: "UNPERSISTED",
  count: 2,
  snapshots: [
    { id: 2, fingerprint: LEDGER_FP_B, claimsMeasured: 19, claimsAsserted: 0, createdAt: LEDGER_TS_NEW, drift: true },
    { id: 1, fingerprint: LEDGER_FP_A, claimsMeasured: 19, claimsAsserted: 0, createdAt: LEDGER_TS_OLD, drift: false },
  ],
  retention: { keep: 168, oldestRetainedId: 1, oldestRetainedIsGenesis: true },
};
const LIVE_SUMMARY_EMPTY = {
  state: "EMPTY",
  persistence: "POSTGRES",
  count: 0,
  latestFingerprint: null,
  capturedAt: null,
  claimsMeasured: null,
  claimsAsserted: null,
  drift: false,
  retention: { keep: 168, oldestRetainedId: null, oldestRetainedIsGenesis: false },
};
const LIVE_SUMMARY_POPULATED = {
  state: "POPULATED",
  persistence: "UNPERSISTED",
  count: 2,
  latestFingerprint: LEDGER_FP_B,
  capturedAt: LEDGER_TS_NEW,
  claimsMeasured: 19,
  claimsAsserted: 0,
  drift: true,
  retention: { keep: 168, oldestRetainedId: 1, oldestRetainedIsGenesis: true },
};
const LIVE_SCHEDULER_STATUS = [
  {
    id: "pulse",
    name: "Pulse",
    nameAr: "النبض",
    active: true,
    interval: 60000,
    intervalHuman: "1m",
    lastRun: "2026-01-01T00:00:00.000Z",
    nextRun: "2026-01-01T00:01:00.000Z",
    msUntilNext: 60000,
    runCount: 1,
    avgDuration: 30,
    status: "HEALTHY",
    actions: 5,
  },
  {
    id: "breath",
    name: "Breath",
    nameAr: "التنفس",
    active: true,
    interval: 300000,
    intervalHuman: "5m",
    lastRun: "2026-01-01T00:00:00.000Z",
    nextRun: "2026-01-01T00:05:00.000Z",
    msUntilNext: 300000,
    runCount: 1,
    avgDuration: 40,
    status: "HEALTHY",
    actions: 5,
  },
  {
    id: "digest",
    name: "Digest",
    nameAr: "الهضم",
    active: false,
    interval: 900000,
    intervalHuman: "15m",
    lastRun: null,
    nextRun: null,
    msUntilNext: null,
    runCount: 0,
    avgDuration: 0,
    status: "HEALTHY",
    actions: 5,
  },
  {
    id: "dream",
    name: "Dream",
    nameAr: "الحلم",
    active: false,
    interval: 3600000,
    intervalHuman: "1h",
    lastRun: null,
    nextRun: null,
    msUntilNext: null,
    runCount: 0,
    avgDuration: 0,
    status: "HEALTHY",
    actions: 5,
  },
  {
    id: "renew",
    name: "Renew",
    nameAr: "التجديد",
    active: false,
    interval: 86400000,
    intervalHuman: "1d",
    lastRun: null,
    nextRun: null,
    msUntilNext: null,
    runCount: 0,
    avgDuration: 0,
    status: "HEALTHY",
    actions: 8,
  },
];
// STE-P-292: full per-bridge surfaces with honest-by-construction
// per-bridge checksums (same canonical helpers the server uses).
// Declared BEFORE LIVE_SELFVERIFY because bridgeRuntime.checksum must
// equal the titan fixture checksum (P290 cross-surface identity).
const CORPUS_SURFACE_FIELDS = {
  enabled: true,
  hasSharedSecret: true,
  compatibility: "BRIDGE_READY",
  persistence: "POSTGRES",
  manifestSha256: MANIFEST_SHA,
  corpusDocs: 22500,
  publicSearch: { engine: "lexical-v1", indexedDocs: 22500, probeQuery: "entropy principles", totalMatches: 4 },
};
const INTENT_SURFACE_FIELDS = {
  enabled: false,
  hasSharedSecret: false,
  compatibility: "BRIDGE_GUARDED",
  classify: {
    engine: "intent-lexical-v1",
    mode: "LEXICAL",
    probeText: "كم سعر التطعيم؟",
    topIntent: "PRICE",
    topConfidence: 0.9,
    tokenCount: 3,
  },
};
const TITAN_SURFACE_FIELDS = {
  enabled: false,
  hasSharedSecret: false,
  compatibility: "BRIDGE_GUARDED",
  providerCounts: { validated: 0, configuredUnprobed: 1, missingKey: 0 },
  memoryMode: "memory",
};
const CORPUS_FIXTURE_CHECKSUM = computeCorpusBridgeChecksum(CORPUS_SURFACE_FIELDS);
const INTENT_FIXTURE_CHECKSUM = computeIntentBridgeChecksum(INTENT_SURFACE_FIELDS);
const TITAN_FIXTURE_CHECKSUM = computeTitanBridgeChecksum(TITAN_SURFACE_FIELDS);

const LIVE_SELFVERIFY_ITEMS = [
  { area: "health", name: "Database", verdict: "IMPLEMENTED_PROVEN", measured: true },
  { area: "health", name: "Scheduler", verdict: "IMPLEMENTED_PROVEN", measured: true, detail: "2/5 rhythms active, 0 failing; IUC cron active, last tick 2026-01-01T00:00:00.000Z" },
  { area: "corpus", name: "Corpus", verdict: "DEMO", measured: true },
  { area: "providers", name: "openai", verdict: "PARTIAL", measured: true, detail: "status=CONFIGURED_UNPROBED keyPrefix=sk-p" },
  { area: "runtime", name: "Titan Bridge Proof Surface", verdict: "IMPLEMENTED_PROVEN", measured: true },
];
// STE-P-293: the fingerprint sections served alongside items in the
// same onx.selfVerify body — the contract RECOMPUTES the fingerprint
// from them, so the fixture computes it with the SAME shared helper
// the server uses (honest by construction; forgery tests mutate).
const LIVE_SELFVERIFY_HEALTH = [
  { name: "Database", status: "HEALTHY" },
  { name: "Scheduler", status: "HEALTHY" },
];
const LIVE_SELFVERIFY_CORPUS = { rawTotal: 22500, uniqueByTitleBody: 22500, duplicates: 0, persistence: "UNPERSISTED" };
const LIVE_SELFVERIFY_PROVIDERS = [{ id: "openai", status: "CONFIGURED_UNPROBED" }];
const LIVE_SELFVERIFY_BRIDGES = ["corpusQuery", "intentEngine", "titanBridge"].map((id) => ({
  id,
  enabled: false,
  hasSharedSecret: false,
  failClosed: true,
}));
const LIVE_SELFVERIFY_BRIDGE_RUNTIME = {
  bridge: "titanBridge",
  bridgeEnabled: false,
  hasSharedSecret: false,
  providerCounts: { validated: 0, configuredUnprobed: 1, missingKey: 0 },
  memoryMode: "memory",
  compatibility: "BRIDGE_GUARDED",
  commitSha: null,
  // STE-P-290: cross-surface identity — MUST equal
  // LIVE_BRIDGE_SURFACES.surfaces.titanBridge.checksum (same evidence
  // source, bridge-runtime-proof.ts). Drift tests mutate it explicitly.
  checksum: TITAN_FIXTURE_CHECKSUM,
};

const LIVE_SELFVERIFY = {
  items: LIVE_SELFVERIFY_ITEMS,
  health: LIVE_SELFVERIFY_HEALTH,
  corpus: LIVE_SELFVERIFY_CORPUS,
  providers: LIVE_SELFVERIFY_PROVIDERS,
  bridges: LIVE_SELFVERIFY_BRIDGES,
  bridgeRuntime: LIVE_SELFVERIFY_BRIDGE_RUNTIME,
  claimsMeasured: 5,
  claimsAsserted: 0,
  fingerprint: computeSelfVerifyFingerprint({
    items: LIVE_SELFVERIFY_ITEMS,
    health: LIVE_SELFVERIFY_HEALTH,
    corpus: LIVE_SELFVERIFY_CORPUS,
    providers: LIVE_SELFVERIFY_PROVIDERS,
    bridges: LIVE_SELFVERIFY_BRIDGES,
    bridgeRuntime: LIVE_SELFVERIFY_BRIDGE_RUNTIME,
    claimsMeasured: 5,
    claimsAsserted: 0,
  }),
  truthLedgerSummary: LIVE_SUMMARY_EMPTY,
};

// A full honest-live fetch double routing by URL.
// STE-P-289: live-shaped onx.bridgeSurfaces aggregate. The aggregate
// checksum is COMPUTED with the same shared canonical helper the server
// uses — the fixture is honest by construction, and the forged-checksum
// tests mutate it explicitly.
const BRIDGE_SURFACE_PARTS = [
  { bridge: "corpusQuery", compatibility: "BRIDGE_READY", checksum: CORPUS_FIXTURE_CHECKSUM },
  { bridge: "intentEngine", compatibility: "BRIDGE_GUARDED", checksum: INTENT_FIXTURE_CHECKSUM },
  { bridge: "titanBridge", compatibility: "BRIDGE_GUARDED", checksum: TITAN_FIXTURE_CHECKSUM },
];
const LIVE_BRIDGE_SURFACES = {
  access: "PUBLIC_READ",
  total: 3,
  ready: 1,
  guarded: 2,
  checksum: computeBridgeSurfacesChecksum(BRIDGE_SURFACE_PARTS, 1, 2),
  surfaces: {
    // STE-P-291: corpusQuery mirrors LIVE_MANIFEST (same manifest source
    // live) — cross-surface identity holds by default; drift tests mutate.
    corpusQuery: {
      ...BRIDGE_SURFACE_PARTS[0],
      ...CORPUS_SURFACE_FIELDS,
      access: "PUBLIC_READ",
    },
    intentEngine: {
      ...BRIDGE_SURFACE_PARTS[1],
      ...INTENT_SURFACE_FIELDS,
      access: "PUBLIC_READ",
    },
    // STE-P-290: titanBridge mirrors LIVE_SELFVERIFY.bridgeRuntime exactly
    // (same evidence source live) — cross-surface identity holds by default.
    titanBridge: {
      ...BRIDGE_SURFACE_PARTS[2],
      ...TITAN_SURFACE_FIELDS,
      access: "PUBLIC_READ",
    },
  },
};

function liveFetch(overrides: Partial<Record<string, SmokeResponse>> = {}): FetchLike {
  return async (url, init) => {
    if (url.endsWith("/health")) return overrides.health ?? resp(200, LIVE_HEALTH);
    if (url.endsWith("/commit")) return overrides.commit ?? resp(200, LIVE_COMMIT);
    if (url.includes("onx.selfVerify")) return overrides.selfVerify ?? trpcOk(LIVE_SELFVERIFY);
    if (url.includes("onx.bridgeSurfaces")) return overrides.bridgeSurfaces ?? trpcOk(LIVE_BRIDGE_SURFACES);
    if (url.includes("scheduler.status")) return overrides.schedulerStatus ?? trpcOk(LIVE_SCHEDULER_STATUS);
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
    if (url.endsWith("/truth")) return overrides.truthPage ?? html(200, LIVE_TRUTH_HTML);
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
  it("health fails on non-sha commit, invalid env, invalid uptime, or non-parseable/future timestamp", () => {
    expect(checkHealth(200, { ...LIVE_HEALTH, commit: "unknown" }, null).passed).toBe(false);
    expect(checkHealth(200, { ...LIVE_HEALTH, env: "prod" }, null).passed).toBe(false);
    expect(checkHealth(200, { ...LIVE_HEALTH, uptime: -1 }, null).passed).toBe(false);
    expect(checkHealth(200, { ...LIVE_HEALTH, timestamp: "not-a-date" }, null).passed).toBe(false);
    expect(
      checkHealth(
        200,
        { ...LIVE_HEALTH, timestamp: "2026-01-01T00:20:00.000Z" },
        null,
        Date.parse("2026-01-01T00:00:00.000Z"),
      ).passed,
    ).toBe(false);
  });

  it("selfVerify passes on five-state verdicts + asserted=0 + sha256 fp + total count", () => {
    expect(
      checkSelfVerify(
        200,
        LIVE_SELFVERIFY,
        { status: 200, rows: LIVE_SCHEDULER_STATUS, nowMs: Date.parse("2026-01-01T00:00:00.000Z") },
      ).passed,
    ).toBe(true);
  });
  it("selfVerify fails on forged counters, bad verdict/measured flag, bad fingerprint, or invalid truthLedgerSummary.count", () => {
    expect(checkSelfVerify(200, { ...LIVE_SELFVERIFY, claimsMeasured: 2 }).passed).toBe(false);
    expect(checkSelfVerify(200, { ...LIVE_SELFVERIFY, claimsAsserted: 1 }).passed).toBe(false);
    expect(
      checkSelfVerify(200, { ...LIVE_SELFVERIFY, items: [{ verdict: "MADE_UP", measured: true }] }).passed,
    ).toBe(false);
    expect(
      checkSelfVerify(200, { ...LIVE_SELFVERIFY, items: [{ verdict: "DEMO", measured: "yes" as never }] }).passed,
    ).toBe(false);
    expect(checkSelfVerify(200, { ...LIVE_SELFVERIFY, fingerprint: "short" }).passed).toBe(false);
    expect(checkSelfVerify(200, { ...LIVE_SELFVERIFY, truthLedgerSummary: { count: -1 } }).passed).toBe(false);
    expect(
      checkSelfVerify(200, {
        ...LIVE_SELFVERIFY,
        bridgeRuntime: { ...LIVE_SELFVERIFY.bridgeRuntime, providerCounts: { validated: -1, configuredUnprobed: 1, missingKey: 0 } },
      }).passed,
    ).toBe(false);
  });

  // STE-P-297: provider trust-distribution per-bucket identity.
  it("selfVerify PASSES and proves providerCounts per-bucket tally == provider items (STE-P-297)", () => {
    const r = checkSelfVerify(200, LIVE_SELFVERIFY);
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/providerCounts per-bucket tally == provider items/);
  });

  it("selfVerify FAILS on a fabricated provider trust distribution that still sums correctly (STE-P-297)", () => {
    // openai is CONFIGURED_UNPROBED (item verdict PARTIAL). A deploy forges
    // providerCounts={validated:1,...} — total (1) still matches the single
    // provider item, so the pre-P297 total-only check passed. Recompute the
    // fingerprint so the forgery reaches the per-bucket check, not the
    // fingerprint gate.
    const forged: Record<string, any> = JSON.parse(JSON.stringify(LIVE_SELFVERIFY));
    forged.bridgeRuntime.providerCounts = { validated: 1, configuredUnprobed: 0, missingKey: 0 };
    forged.fingerprint = computeSelfVerifyFingerprint({
      items: forged.items,
      health: forged.health,
      corpus: forged.corpus,
      providers: forged.providers,
      bridges: forged.bridges,
      bridgeRuntime: forged.bridgeRuntime,
      claimsMeasured: forged.claimsMeasured,
      claimsAsserted: forged.claimsAsserted,
    });
    const r = checkSelfVerify(200, forged as never);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/providerCounts\.validated=1 contradicts provider items tally \(0\)/);
    expect(r.detail).toMatch(/fabricated provider trust distribution/);
  });

  it("selfVerify fails on forged truthLedgerSummary derived coherence", () => {
    expect(
      checkSelfVerify(200, {
        ...LIVE_SELFVERIFY,
        truthLedgerSummary: { ...LIVE_SUMMARY_EMPTY, state: "EMPTY", count: 2 },
      }).passed,
    ).toBe(false);
    expect(
      checkSelfVerify(200, {
        ...LIVE_SELFVERIFY,
        truthLedgerSummary: {
          ...LIVE_SUMMARY_POPULATED,
          retention: { ...LIVE_SUMMARY_POPULATED.retention, oldestRetainedId: 1, oldestRetainedIsGenesis: false },
        },
      }).passed,
    ).toBe(false);
  });

  it("selfVerify fails when scheduler detail-derived counts diverge from scheduler.status", () => {
    expect(
      checkSelfVerify(
        200,
        {
          ...LIVE_SELFVERIFY,
          items: LIVE_SELFVERIFY.items.map((it) =>
            it.name === "Scheduler"
              ? { ...it, detail: "1/5 rhythms active, 0 failing; IUC cron active, last tick 2026-01-01T00:00:00.000Z" }
              : it,
          ),
        },
        { status: 200, rows: LIVE_SCHEDULER_STATUS, nowMs: Date.parse("2026-01-01T00:00:00.000Z") },
      ).passed,
    ).toBe(false);
  });

  it("selfVerify fails when scheduler nextRun/msUntilNext coherence is forged", () => {
    expect(
      checkSelfVerify(
        200,
        LIVE_SELFVERIFY,
        {
          status: 200,
          rows: LIVE_SCHEDULER_STATUS.map((r, i) => (i === 0 ? { ...r, active: false, nextRun: "2026-01-01T00:01:00.000Z", msUntilNext: 60000 } : r)),
          nowMs: Date.parse("2026-01-01T00:00:00.000Z"),
        },
      ).passed,
    ).toBe(false);
  });

  it("rate disclosure accepts EITHER honest MEASURED backing store (STE-K-19)", () => {
    // memory-mode surface still passes…
    expect(checkRateDisclosure(200, LIVE_PROVIDERS).passed).toBe(true);
    // …and a Postgres-backed measured surface passes too.
    const pgSurface = { rateLimit: { persistence: "POSTGRES_PERSISTED", limit: 60, category: "PUBLIC_READ" } };
    expect(checkRateDisclosure(200, pgSurface).passed).toBe(true);
    // bare/unknown labels are NOT honest measured modes → fail.
    expect(checkRateDisclosure(200, { rateLimit: { persistence: "POSTGRES" } }).passed).toBe(false);
    expect(checkRateDisclosure(200, {}).passed).toBe(false);
    // operator-asserted expected mode: a mismatch is a real breach…
    expect(checkRateDisclosure(200, LIVE_PROVIDERS, "POSTGRES_PERSISTED").passed).toBe(false);
    // …and a match passes.
    expect(checkRateDisclosure(200, pgSurface, "POSTGRES_PERSISTED").passed).toBe(true);
  });

  // STE-P-296: providers cross-surface identity direct-evaluator tests.
  it("providers cross-surface identity: matching {id,status} lists pass (STE-P-296)", () => {
    const status = [
      { id: "openai", status: "CONFIGURED_UNPROBED", keyPrefix: "sk-p" },
      { id: "anthropic", status: "MISSING_KEY" },
    ];
    const selfVerify = [
      { id: "openai", status: "CONFIGURED_UNPROBED" },
      { id: "anthropic", status: "MISSING_KEY" },
    ];
    expect(checkProvidersCrossSurface(status, selfVerify)).toBeNull();
  });

  it("providers cross-surface identity: tolerant when selfVerify list absent (STE-P-296)", () => {
    expect(checkProvidersCrossSurface([{ id: "openai", status: "MISSING_KEY" }], undefined)).toBeNull();
  });

  it("providers cross-surface identity: status drift on a provider is named (STE-P-296)", () => {
    const status = [{ id: "openai", status: "VALIDATED", keyPrefix: "sk-p" }];
    const selfVerify = [{ id: "openai", status: "CONFIGURED_UNPROBED" }];
    const m = checkProvidersCrossSurface(status, selfVerify);
    expect(m).toMatch(/providers cross-surface drift for openai/);
    expect(m).toMatch(/VALIDATED/);
    expect(m).toMatch(/CONFIGURED_UNPROBED/);
  });

  it("providers cross-surface identity: length/id drift and empty status are named (STE-P-296)", () => {
    // length mismatch
    expect(
      checkProvidersCrossSurface(
        [{ id: "openai", status: "MISSING_KEY" }],
        [
          { id: "openai", status: "MISSING_KEY" },
          { id: "anthropic", status: "MISSING_KEY" },
        ],
      ),
    ).toMatch(/has 1 entries but selfVerify has 2/);
    // id mismatch at position
    expect(
      checkProvidersCrossSurface(
        [{ id: "anthropic", status: "MISSING_KEY" }],
        [{ id: "openai", status: "MISSING_KEY" }],
      ),
    ).toMatch(/drift at #0/);
    // providers.status serves no providers but selfVerify does
    expect(checkProvidersCrossSurface([], [{ id: "openai", status: "MISSING_KEY" }])).toMatch(
      /carries no providers array/,
    );
  });

  it("ask refusal passes on honest INSUFFICIENT_EVIDENCE + DEMO + no citations", () => {
    expect(checkAskRefusal(200, LIVE_ASK_REFUSAL).passed).toBe(true);
  });

  // ---- STE-P-295: commit cross-surface identity (direct evaluators) ----
  describe("STE-P-295 commit cross-surface identity (direct evaluators)", () => {
    const HEALTH = { commit: COMMIT, bootTime: "2026-01-01T00:00:00.000Z" };

    it("passes when /commit matches /health commit + bootTime + service", () => {
      expect(checkCommitCrossSurface(HEALTH, 200, LIVE_COMMIT)).toBeNull();
    });

    it("fails on a non-200 /commit", () => {
      expect(checkCommitCrossSurface(HEALTH, 503, LIVE_COMMIT)).toMatch(/\/commit returned 503/);
    });

    it("fails when /commit omits the commit field or serves a non-sha", () => {
      expect(checkCommitCrossSurface(HEALTH, 200, { ...LIVE_COMMIT, commit: undefined })).toMatch(
        /no commit field/,
      );
      expect(checkCommitCrossSurface(HEALTH, 200, { ...LIVE_COMMIT, commit: "not-a-sha" })).toMatch(
        /not sha-like hex/,
      );
    });

    it("fails on commit drift between /health and /commit (split/stale deploy)", () => {
      const drifted = { ...LIVE_COMMIT, commit: "0000000000000000000000000000000000000000" };
      expect(checkCommitCrossSurface(HEALTH, 200, drifted)).toMatch(
        /commit cross-surface drift: \/health=.* \/commit=0000000000/,
      );
    });

    it("fails on bootTime drift (responses from different processes)", () => {
      const drifted = { ...LIVE_COMMIT, bootTime: "2020-01-01T00:00:00.000Z" };
      expect(checkCommitCrossSurface(HEALTH, 200, drifted)).toMatch(/bootTime cross-surface drift/);
    });

    it("fails on an unexpected service label", () => {
      const drifted = { ...LIVE_COMMIT, service: "some-other-service" };
      expect(checkCommitCrossSurface(HEALTH, 200, drifted)).toMatch(/service label unexpected/);
    });

    it("accepts short/prefix commit forms across surfaces", () => {
      const shortHealth = { commit: COMMIT.slice(0, 7), bootTime: "2026-01-01T00:00:00.000Z" };
      expect(checkCommitCrossSurface(shortHealth, 200, LIVE_COMMIT)).toBeNull();
    });

    it("selfVerify passes when bridgeRuntime.commitSha matches the deployed commit", () => {
      const withSha = {
        ...LIVE_SELFVERIFY,
        bridgeRuntime: { ...LIVE_SELFVERIFY_BRIDGE_RUNTIME, commitSha: COMMIT },
        fingerprint: computeSelfVerifyFingerprint({
          items: LIVE_SELFVERIFY_ITEMS,
          health: LIVE_SELFVERIFY_HEALTH,
          corpus: LIVE_SELFVERIFY_CORPUS,
          providers: LIVE_SELFVERIFY_PROVIDERS,
          bridges: LIVE_SELFVERIFY_BRIDGES,
          bridgeRuntime: { ...LIVE_SELFVERIFY_BRIDGE_RUNTIME, commitSha: COMMIT },
          claimsMeasured: 5,
          claimsAsserted: 0,
        }),
      };
      const r = checkSelfVerify(200, withSha as never, undefined, { deployedCommit: COMMIT });
      expect(r.passed).toBe(true);
      expect(r.detail).toMatch(/bridgeRuntime\.commitSha == \/health commit \(cross-surface\)/);
    });

    it("selfVerify fails when bridgeRuntime.commitSha diverges from the deployed commit", () => {
      const forged = "1111111111111111111111111111111111111111";
      const withSha = {
        ...LIVE_SELFVERIFY,
        bridgeRuntime: { ...LIVE_SELFVERIFY_BRIDGE_RUNTIME, commitSha: forged },
        fingerprint: computeSelfVerifyFingerprint({
          items: LIVE_SELFVERIFY_ITEMS,
          health: LIVE_SELFVERIFY_HEALTH,
          corpus: LIVE_SELFVERIFY_CORPUS,
          providers: LIVE_SELFVERIFY_PROVIDERS,
          bridges: LIVE_SELFVERIFY_BRIDGES,
          bridgeRuntime: { ...LIVE_SELFVERIFY_BRIDGE_RUNTIME, commitSha: forged },
          claimsMeasured: 5,
          claimsAsserted: 0,
        }),
      };
      const r = checkSelfVerify(200, withSha as never, undefined, { deployedCommit: COMMIT });
      expect(r.passed).toBe(false);
      expect(r.detail).toMatch(/commit cross-surface drift: bridgeRuntime\.commitSha=1111/);
    });

    it("selfVerify stays tolerant when commitSha is null (local/dev honest)", () => {
      const r = checkSelfVerify(200, LIVE_SELFVERIFY as never, undefined, { deployedCommit: COMMIT });
      expect(r.passed).toBe(true);
    });
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

  // ---- STE-P-294: ask.onx cross-surface disclosure identity ----
  describe("STE-P-294 ask cross-surface identity (direct evaluators)", () => {
    const CROSS = {
      rateLimit: LIVE_PROVIDERS.rateLimit,
      committedDocCount: 22500,
    };

    it("extractCorpusCountFromDisclosure reads the leading unit count from both honest formats", () => {
      expect(extractCorpusCountFromDisclosure("DEMO: corpus of 22500 synthetic units")).toBe(22500);
      expect(
        extractCorpusCountFromDisclosure("AUTHENTIC: الذخيرة مصدر مُودَع أصيل (19012 وحدة، provenance=AUTHENTIC_INGEST)"),
      ).toBe(19012);
      expect(extractCorpusCountFromDisclosure("no numbers here")).toBeNull();
    });

    it("stays tolerant when no cross-surface context is provided (standalone use)", () => {
      const bare = { ...LIVE_ASK_REFUSAL, rateLimit: undefined } as never;
      expect(checkAskRefusal(200, bare).passed).toBe(true);
    });

    it("passes when rateLimit matches providers.status and count matches committed docCount", () => {
      const r = checkAskRefusal(200, LIVE_ASK_REFUSAL, CROSS);
      expect(r.passed).toBe(true);
      expect(r.detail).toMatch(/rateLimit identical to providers\.status/);
      expect(r.detail).toMatch(/corpus count == committed docCount \(22500\)/);
      const c = checkAskCited(200, LIVE_ASK_CITED, {
        ...CROSS,
        peerTruthDisclosure: LIVE_ASK_REFUSAL.truthDisclosure,
      });
      expect(c.passed).toBe(true);
      expect(c.detail).toMatch(/disclosure byte-identical across ask surfaces/);
    });

    it("fails with a named drift when ask rateLimit diverges from providers.status", () => {
      const drifted = {
        ...LIVE_ASK_REFUSAL,
        rateLimit: { ...LIVE_ASK_REFUSAL.rateLimit, persistence: "POSTGRES_PERSISTED" },
      };
      const r = checkAskRefusal(200, drifted, CROSS);
      expect(r.passed).toBe(false);
      expect(r.detail).toMatch(/cross-surface rateLimit drift vs providers\.status: persistence/);
      const limitDrift = checkAskCited(
        200,
        { ...LIVE_ASK_CITED, rateLimit: { ...LIVE_ASK_CITED.rateLimit, limit: 120 } },
        CROSS,
      );
      expect(limitDrift.passed).toBe(false);
      expect(limitDrift.detail).toMatch(/limit ask=120 providers=60/);
      const catDrift = checkAskRefusal(
        200,
        { ...LIVE_ASK_REFUSAL, rateLimit: { ...LIVE_ASK_REFUSAL.rateLimit, category: "BRIDGE_WRITE" } },
        CROSS,
      );
      expect(catDrift.passed).toBe(false);
      expect(catDrift.detail).toMatch(/category ask=BRIDGE_WRITE providers=PUBLIC_READ/);
    });

    it("fails when the ask surface omits rateLimit while providers.status serves one", () => {
      const r = checkAskRefusal(200, { ...LIVE_ASK_REFUSAL, rateLimit: undefined } as never, CROSS);
      expect(r.passed).toBe(false);
      expect(r.detail).toMatch(/missing rateLimit disclosure/);
    });

    it("fails when truthDisclosure claims a corpus size diverging from the committed docCount", () => {
      const lied = { ...LIVE_ASK_CITED, truthDisclosure: "DEMO: corpus of 90000 synthetic units" };
      const r = checkAskCited(200, lied, CROSS);
      expect(r.passed).toBe(false);
      expect(r.detail).toMatch(/claims 90000 units but committed manifest docCount=22500/);
      const countless = { ...LIVE_ASK_CITED, truthDisclosure: "DEMO corpus without a count" };
      expect(checkAskCited(200, countless, CROSS).detail).toMatch(/no measurable corpus count/);
    });

    it("fails when the disclosure prose diverges between the two ask surfaces", () => {
      const r = checkAskCited(200, LIVE_ASK_CITED, {
        ...CROSS,
        peerTruthDisclosure: "DEMO: corpus of 22500 synthetic units (edited)",
      });
      expect(r.passed).toBe(false);
      expect(r.detail).toMatch(/diverges between ask surfaces/);
    });
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
    expect(report.total).toBe(10); // 9 contracts + no_key_leak guard (also scans /truth page)
    expect(report.contracts.map((c) => c.name)).toContain("corpus_manifest_truth");
    expect(report.contracts.map((c) => c.name)).toContain("truth_ledger_read");
    expect(report.contracts.map((c) => c.name)).toContain("bridge_surfaces_read");
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

  it("no_key_leak (STE-K-17) also fails when the /truth page HTML leaks a full key", async () => {
    const leakyTruth = html(200, '<div>sk-abcdefghijklmnopqrstuvwxyz012345</div>');
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ truthPage: leakyTruth }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const leak = report.contracts.find((c) => c.name === "no_key_leak");
    expect(leak?.passed).toBe(false);
    expect(leak?.detail).toMatch(/truthPage:/);
  });

  it("no_key_leak render proof (STE-K-25) passes when /truth serves the real built SPA shell", async () => {
    // The default LIVE_TRUTH_HTML fixture is the real shell (root + bundle).
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({}),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const guard = report.contracts.find((c) => c.name === "no_key_leak");
    expect(guard?.passed).toBe(true);
    expect(guard?.detail).toMatch(/render-proven/);
    expect(report.total).toBe(10); // still 10 — deepened, not a new contract
  });

  it("no_key_leak render proof (STE-K-25) FAILS on a hollow 200 shell (no root, no bundle)", async () => {
    const hollow = html(200, "<!doctype html><html><head></head><body></body></html>");
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ truthPage: hollow }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const guard = report.contracts.find((c) => c.name === "no_key_leak");
    expect(guard?.passed).toBe(false);
    expect(guard?.detail).toMatch(/not-rendered/);
    expect(guard?.detail).toMatch(/no SPA root/);
    expect(guard?.detail).toMatch(/no built module bundle/);
  });

  it("no_key_leak render proof (STE-K-25) FAILS when /truth returns non-200", async () => {
    const errored = html(500, "<!doctype html><html><body><div id=\"root\"></div></body></html>");
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ truthPage: errored }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const guard = report.contracts.find((c) => c.name === "no_key_leak");
    expect(guard?.passed).toBe(false);
    expect(guard?.detail).toMatch(/not-rendered \(status 500\)/);
  });

  describe("assertTruthPageRendered (STE-K-25 pure render-proof)", () => {
    const shell =
      '<!doctype html><html lang="ar" dir="rtl"><head><title>ONX</title>' +
      '<script type="module" crossorigin src="/assets/index-abc123.js"></script></head>' +
      '<body><div id="root"></div></body></html>';

    it("passes for the real built SPA shell", () => {
      expect(assertTruthPageRendered(200, shell)).toBeNull();
    });

    it("fails when the SPA root is missing", () => {
      const noRoot = shell.replace('<div id="root"></div>', "<div></div>");
      expect(assertTruthPageRendered(200, noRoot)).toMatch(/no SPA root/);
    });

    it("fails when the built module bundle is missing", () => {
      const noBundle = shell.replace(
        '<script type="module" crossorigin src="/assets/index-abc123.js"></script>',
        "",
      );
      expect(assertTruthPageRendered(200, noBundle)).toMatch(/no built module bundle/);
    });

    it("fails on a non-200 status even with markers present", () => {
      expect(assertTruthPageRendered(503, shell)).toBe("status 503");
    });

    it("reports BOTH missing markers on a hollow shell", () => {
      const reason = assertTruthPageRendered(200, "<html><body></body></html>");
      expect(reason).toMatch(/no SPA root/);
      expect(reason).toMatch(/no built module bundle/);
    });
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

  // ---- STE-P-294: runner feeds cross-surface context to the ask contracts ----
  it("runner verifies ask cross-surface identity end-to-end (rateLimit + docCount + byte-identity)", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch(),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const refusal = report.contracts.find((c) => c.name === "ask_onx_honest_refusal");
    const cited = report.contracts.find((c) => c.name === "ask_onx_cited_answer");
    expect(refusal?.passed).toBe(true);
    expect(refusal?.detail).toMatch(/rateLimit identical to providers\.status/);
    expect(refusal?.detail).toMatch(/corpus count == committed docCount \(22500\)/);
    expect(cited?.passed).toBe(true);
    expect(cited?.detail).toMatch(/disclosure byte-identical across ask surfaces/);
  });

  it("runner fails ask contracts on cross-surface rateLimit drift vs providers.status", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({
        askCited: trpcOk({
          ...LIVE_ASK_CITED,
          rateLimit: { ...LIVE_ASK_CITED.rateLimit, persistence: "POSTGRES_PERSISTED" },
        }),
      }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const cited = report.contracts.find((c) => c.name === "ask_onx_cited_answer");
    expect(cited?.passed).toBe(false);
    expect(cited?.detail).toMatch(/cross-surface rateLimit drift vs providers\.status: persistence/);
  });

  it("runner fails ask contracts when truthDisclosure lies about the corpus size", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({
        askRefusal: trpcOk({
          ...LIVE_ASK_REFUSAL,
          truthDisclosure: "DEMO: corpus of 90000 synthetic units",
        }),
      }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const refusal = report.contracts.find((c) => c.name === "ask_onx_honest_refusal");
    expect(refusal?.passed).toBe(false);
    expect(refusal?.detail).toMatch(/claims 90000 units but committed manifest docCount=22500/);
  });

  it("runner fails the cited contract when disclosure prose diverges between ask surfaces", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({
        askCited: trpcOk({
          ...LIVE_ASK_CITED,
          truthDisclosure: "DEMO: corpus of 22500 synthetic units (reworded)",
        }),
      }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const cited = report.contracts.find((c) => c.name === "ask_onx_cited_answer");
    expect(cited?.passed).toBe(false);
    expect(cited?.detail).toMatch(/diverges between ask surfaces/);
  });

  // ---- STE-P-295: runner enforces commit cross-surface identity ----
  it("runner verifies /commit identity end-to-end (folded into health_live)", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch(),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const health = report.contracts.find((c) => c.name === "health_live");
    expect(health?.passed).toBe(true);
    expect(health?.detail).toMatch(/\/commit identity verified \(commit\+bootTime\+service\)/);
  });

  it("runner fails health_live when /commit drifts from /health commit", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({
        commit: resp(200, { ...LIVE_COMMIT, commit: "0000000000000000000000000000000000000000" }),
      }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const health = report.contracts.find((c) => c.name === "health_live");
    expect(health?.passed).toBe(false);
    expect(health?.detail).toMatch(/commit cross-surface drift/);
  });

  it("runner fails health_live when /commit is unreachable", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ commit: resp(503, {}) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const health = report.contracts.find((c) => c.name === "health_live");
    expect(health?.passed).toBe(false);
    expect(health?.detail).toMatch(/\/commit returned 503/);
  });

  it("runner fails selfVerify when bridgeRuntime.commitSha diverges from live /health commit", async () => {
    const forged = "1111111111111111111111111111111111111111";
    const brWithSha = { ...LIVE_SELFVERIFY_BRIDGE_RUNTIME, commitSha: forged };
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({
        selfVerify: trpcOk({
          ...LIVE_SELFVERIFY,
          bridgeRuntime: brWithSha,
          fingerprint: computeSelfVerifyFingerprint({
            items: LIVE_SELFVERIFY_ITEMS,
            health: LIVE_SELFVERIFY_HEALTH,
            corpus: LIVE_SELFVERIFY_CORPUS,
            providers: LIVE_SELFVERIFY_PROVIDERS,
            bridges: LIVE_SELFVERIFY_BRIDGES,
            bridgeRuntime: brWithSha,
            claimsMeasured: 5,
            claimsAsserted: 0,
          }),
        }),
      }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const sv = report.contracts.find((c) => c.name === "honest_status_selfverify");
    expect(sv?.passed).toBe(false);
    expect(sv?.detail).toMatch(/commit cross-surface drift: bridgeRuntime\.commitSha=1111/);
  });

  it("truth_ledger_read passes on an honest EMPTY live ledger (named empty state)", async () => {
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
      fetchImpl: liveFetch({
        truthHistory: trpcOk(LIVE_TRUTH_HISTORY_POPULATED),
        selfVerify: trpcOk({ ...LIVE_SELFVERIFY, truthLedgerSummary: LIVE_SUMMARY_POPULATED }),
      }),
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

  // ---- STE-P-296: providers cross-surface identity (folded into rate_limit_disclosure) ----
  it("rate_limit_disclosure passes and proves providers cross-surface identity on honest live shapes (STE-P-296)", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch(),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "rate_limit_disclosure");
    expect(c?.passed).toBe(true);
    expect(c?.detail).toMatch(/cross-surface identity vs selfVerify\.providers verified/);
  });

  it("rate_limit_disclosure FAILS when providers.status trust-state diverges from selfVerify.providers (STE-P-296)", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({
        // providers.status forges a stronger trust state than selfVerify serves
        providers: trpcOk({
          ...LIVE_PROVIDERS,
          providers: [{ id: "openai", status: "VALIDATED", keyPrefix: "sk-p" }],
        }),
      }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const c = report.contracts.find((x) => x.name === "rate_limit_disclosure");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/providers cross-surface drift for openai/);
  });

  // ---- STE-P-289: bridge_surfaces_read (10th contract) ----
  it("bridge_surfaces_read passes on an honest aggregate and RECOMPUTES the checksum", async () => {
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch(),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(true);
    expect(c?.detail).toMatch(/RECOMPUTED from served parts/);
    expect(c?.detail).toMatch(/ready=1, guarded=2/);
    // STE-P-292: all three per-bridge checksums recomputed from served fields
    expect(c?.detail).toMatch(/per-bridge checksums RECOMPUTED from served fields \(3\/3\)/);
    // STE-P-290: the runner feeds selfVerify.bridgeRuntime — identity verified
    expect(c?.detail).toMatch(/cross-surface identity vs selfVerify\.bridgeRuntime verified/);
    // STE-P-291: the runner feeds corpusQuery.manifest — identity verified
    expect(c?.detail).toMatch(/cross-surface identity vs corpusQuery\.manifest verified/);
  });

  // ---- STE-P-290: cross-surface identity (deepening, total stays 10) ----
  // STE-P-293 note: bridgeRuntime is INSIDE the selfVerify fingerprint, so a
  // drifted fixture must recompute its fingerprint (internally honest) —
  // otherwise honest_status_selfverify catches the mutation first and the
  // cross-surface check is never the named failure.
  function internallyHonestSelfVerifyDrift(mutate: (sv: Record<string, any>) => void) {
    const drifted = JSON.parse(JSON.stringify(LIVE_SELFVERIFY));
    mutate(drifted);
    drifted.fingerprint = computeSelfVerifyFingerprint({
      items: drifted.items,
      health: drifted.health,
      corpus: drifted.corpus,
      providers: drifted.providers,
      bridges: drifted.bridges,
      bridgeRuntime: drifted.bridgeRuntime,
      claimsMeasured: drifted.claimsMeasured,
      claimsAsserted: drifted.claimsAsserted,
    });
    return drifted;
  }

  it("bridge_surfaces_read fails when titanBridge.checksum drifts from selfVerify.bridgeRuntime", async () => {
    const drifted = internallyHonestSelfVerifyDrift((sv) => {
      sv.bridgeRuntime.checksum = "b".repeat(64);
    });
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ selfVerify: trpcOk(drifted) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    // The mutation is internally honest — ONLY the cross-surface check fires.
    expect(report.contracts.find((x) => x.name === "honest_status_selfverify")?.passed).toBe(true);
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/cross-surface drift: titanBridge\.checksum/);
    expect(c?.detail).toMatch(/same evidence source must agree/);
  });

  it("bridge_surfaces_read fails when compatibility disagrees across surfaces", async () => {
    const drifted = internallyHonestSelfVerifyDrift((sv) => {
      sv.bridgeRuntime.compatibility = "BRIDGE_READY";
      sv.bridgeRuntime.bridgeEnabled = true;
      sv.bridgeRuntime.hasSharedSecret = true;
    });
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ selfVerify: trpcOk(drifted) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/cross-surface drift: titanBridge\.compatibility/);
  });

  it("bridge_surfaces_read fails when providerCounts disagree across surfaces", async () => {
    const drifted = internallyHonestSelfVerifyDrift((sv) => {
      sv.bridgeRuntime.providerCounts = { validated: 1, configuredUnprobed: 0, missingKey: 0 };
    });
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ selfVerify: trpcOk(drifted) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/cross-surface drift: titanBridge\.providerCounts\.validated/);
  });

  // STE-P-297: end-to-end — a forged provider trust distribution that still
  // sums correctly is caught by honest_status_selfverify (per-bucket tally).
  it("honest_status_selfverify fails end-to-end on a fabricated provider trust distribution (STE-P-297)", async () => {
    const drifted = internallyHonestSelfVerifyDrift((sv) => {
      // total stays 1 (matches the single provider item) but the bucket lies
      sv.bridgeRuntime.providerCounts = { validated: 1, configuredUnprobed: 0, missingKey: 0 };
    });
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ selfVerify: trpcOk(drifted) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.passed).toBe(false);
    const c = report.contracts.find((x) => x.name === "honest_status_selfverify");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/fabricated provider trust distribution/);
  });

  it("bridge_surfaces_read fails when memoryMode disagrees across surfaces", async () => {
    const drifted = internallyHonestSelfVerifyDrift((sv) => {
      sv.bridgeRuntime.memoryMode = "pg";
    });
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ selfVerify: trpcOk(drifted) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/cross-surface drift: titanBridge\.memoryMode/);
  });

  // ---- STE-P-293: selfVerify fingerprint recomputation (anti-forgery) ----
  it("honest_status_selfverify RECOMPUTES the fingerprint and passes on the honest fixture", () => {
    const r = checkSelfVerify(200, LIVE_SELFVERIFY);
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/fingerprint RECOMPUTED from served sections and verified/);
  });

  it("honest_status_selfverify fails on a forged-but-well-formed fingerprint", () => {
    const r = checkSelfVerify(200, { ...LIVE_SELFVERIFY, fingerprint: "a".repeat(64) });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/fingerprint forged\/stale: served=a{12}/);
    expect(r.detail).toMatch(/recomputed=[0-9a-f]{64}/);
  });

  it("honest_status_selfverify fails when a section mutates but the fingerprint stays stale (drift caught)", () => {
    for (const mutate of [
      (sv: Record<string, any>) => { sv.corpus = { ...sv.corpus, rawTotal: 99999 }; },
      (sv: Record<string, any>) => { sv.health = [{ name: "Database", status: "UNAVAILABLE" }, sv.health[1]]; },
      (sv: Record<string, any>) => { sv.providers = [{ id: "openai", status: "VALIDATED" }]; },
      (sv: Record<string, any>) => { sv.bridges = sv.bridges.map((b: Record<string, unknown>) => ({ ...b, enabled: true })); },
    ] as Array<(sv: Record<string, any>) => void>) {
      const stale = JSON.parse(JSON.stringify(LIVE_SELFVERIFY));
      mutate(stale);
      const r = checkSelfVerify(200, stale);
      expect(r.passed).toBe(false);
      expect(r.detail).toMatch(/fingerprint forged\/stale/);
    }
  });

  it("honest_status_selfverify fails with a NAMED error when fingerprint sections are stripped", () => {
    const stripped = JSON.parse(JSON.stringify(LIVE_SELFVERIFY));
    delete stripped.health;
    delete stripped.corpus;
    const r = checkSelfVerify(200, stripped);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/fingerprint sections missing from served report: health, corpus/);
    const noBridges = JSON.parse(JSON.stringify(LIVE_SELFVERIFY));
    noBridges.bridges = [];
    expect(checkSelfVerify(200, noBridges).detail).toMatch(/fingerprint sections missing from served report: bridges/);
  });

  it("honest_status_selfverify fails on malformed bridges/corpus sections (named)", () => {
    const badBridge = JSON.parse(JSON.stringify(LIVE_SELFVERIFY));
    badBridge.bridges[1] = { id: "intentEngine", enabled: "yes", hasSharedSecret: false, failClosed: true };
    expect(checkSelfVerify(200, badBridge).detail).toMatch(/bridges entry malformed \(intentEngine\)/);
    const badCorpus = JSON.parse(JSON.stringify(LIVE_SELFVERIFY));
    badCorpus.corpus = { rawTotal: "many", uniqueByTitleBody: 1, duplicates: 0, persistence: "UNPERSISTED" };
    expect(checkSelfVerify(200, badCorpus).detail).toMatch(/corpus section malformed/);
  });

  it("runner surfaces the fingerprint recomputation live-shaped end-to-end", async () => {
    const forged = JSON.parse(JSON.stringify(LIVE_SELFVERIFY));
    forged.fingerprint = "e".repeat(64);
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ selfVerify: trpcOk(forged) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "honest_status_selfverify");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/fingerprint forged\/stale/);
    expect(report.passed).toBe(false);
  });

  // ---- STE-P-291: corpusQuery cross-surface identity vs corpusQuery.manifest ----
  // STE-P-292 note: the drifted surface must stay INTERNALLY honest (its
  // per-bridge checksum recomputed over the drifted fields) so that ONLY
  // the cross-surface identity check can catch the lie.
  function internallyHonestCorpusDrift(mutate: (cq: Record<string, unknown>) => void) {
    const drifted = JSON.parse(JSON.stringify(LIVE_BRIDGE_SURFACES));
    mutate(drifted.surfaces.corpusQuery);
    drifted.surfaces.corpusQuery.checksum = computeCorpusBridgeChecksum(drifted.surfaces.corpusQuery);
    drifted.checksum = computeBridgeSurfacesChecksum(
      (["corpusQuery", "intentEngine", "titanBridge"] as const).map((k) => ({
        bridge: k,
        compatibility: drifted.surfaces[k].compatibility,
        checksum: drifted.surfaces[k].checksum,
      })),
      drifted.ready,
      drifted.guarded,
    );
    return drifted;
  }

  it("bridge_surfaces_read fails when corpusQuery.manifestSha256 drifts from the served manifest", async () => {
    const drifted = internallyHonestCorpusDrift((cq) => { cq.manifestSha256 = "d".repeat(64); });
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ bridgeSurfaces: trpcOk(drifted) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/cross-surface drift: corpusQuery\.manifestSha256/);
    expect(c?.detail).toMatch(/same manifest source must agree/);
  });

  it("bridge_surfaces_read fails when corpusQuery.corpusDocs disagrees with manifest.docCount", async () => {
    const drifted = internallyHonestCorpusDrift((cq) => { cq.corpusDocs = 1; });
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ bridgeSurfaces: trpcOk(drifted) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/cross-surface drift: corpusQuery\.corpusDocs=1 but corpusQuery\.manifest\.docCount=22500/);
  });

  // ---- STE-P-292: per-bridge checksum recomputation + compatibility honesty ----
  it("bridge_surfaces_read fails when a per-bridge checksum is forged but well-formed", async () => {
    for (const key of ["corpusQuery", "intentEngine", "titanBridge"] as const) {
      const drifted = JSON.parse(JSON.stringify(LIVE_BRIDGE_SURFACES));
      drifted.surfaces[key].checksum = "c".repeat(64);
      // keep the aggregate honest over the forged part so ONLY the
      // per-bridge recomputation can catch the forgery
      drifted.checksum = computeBridgeSurfacesChecksum(
        (["corpusQuery", "intentEngine", "titanBridge"] as const).map((k) => ({
          bridge: k,
          compatibility: drifted.surfaces[k].compatibility,
          checksum: drifted.surfaces[k].checksum,
        })),
        drifted.ready,
        drifted.guarded,
      );
      const report = await runSmoke("https://x.dev", {
        fetchImpl: liveFetch({ bridgeSurfaces: trpcOk(drifted) }),
        expectedSha: null,
        committedManifest: COMMITTED_MANIFEST,
      });
      const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
      expect(c?.passed).toBe(false);
      expect(c?.detail).toMatch(new RegExp(`per-bridge checksum forged/stale: ${key}`));
    }
  });

  it("bridge_surfaces_read fails when compatibility lies about enabled/hasSharedSecret", async () => {
    const drifted = JSON.parse(JSON.stringify(LIVE_BRIDGE_SURFACES));
    // titan claims READY while enabled=false — compatibility is not part of
    // the titan checksum payload, so only the semantic check can catch it
    drifted.surfaces.titanBridge.compatibility = "BRIDGE_READY";
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ bridgeSurfaces: trpcOk(drifted) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/surface titanBridge compatibility lies: served BRIDGE_READY, but enabled=false hasSharedSecret=false derives BRIDGE_GUARDED/);
  });

  it("bridge_surfaces_read fails when semantic fields required for recomputation are stripped", async () => {
    const drifted = JSON.parse(JSON.stringify(LIVE_BRIDGE_SURFACES));
    delete drifted.surfaces.intentEngine.classify;
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ bridgeSurfaces: trpcOk(drifted) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/surface intentEngine is missing the semantic fields required to recompute its checksum/);
  });

  it("bridge_surfaces_read fails when the served aggregate checksum is forged", async () => {
    const forged = { ...LIVE_BRIDGE_SURFACES, checksum: "f".repeat(64) };
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ bridgeSurfaces: trpcOk(forged) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/forged\/stale/);
  });

  it("bridge_surfaces_read fails when a bridge surface is missing", async () => {
    const partial = {
      ...LIVE_BRIDGE_SURFACES,
      surfaces: { corpusQuery: LIVE_BRIDGE_SURFACES.surfaces.corpusQuery },
    };
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ bridgeSurfaces: trpcOk(partial) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/missing bridge surface: intentEngine/);
  });

  it("bridge_surfaces_read fails when the ready/guarded split lies about the parts", async () => {
    const lying = { ...LIVE_BRIDGE_SURFACES, ready: 3, guarded: 0 };
    const report = await runSmoke("https://x.dev", {
      fetchImpl: liveFetch({ bridgeSurfaces: trpcOk(lying) }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    const c = report.contracts.find((x) => x.name === "bridge_surfaces_read");
    expect(c?.passed).toBe(false);
    expect(c?.detail).toMatch(/split lies/);
  });
});

describe("checkBridgeSurfacesRead (STE-P-289)", () => {
  it("rejects non-200, wrong access, malformed per-bridge checksums and wrong totals", () => {
    expect(checkBridgeSurfacesRead(503, LIVE_BRIDGE_SURFACES).passed).toBe(false);
    expect(checkBridgeSurfacesRead(200, { ...LIVE_BRIDGE_SURFACES, access: "PRIVATE" }).passed).toBe(false);
    expect(checkBridgeSurfacesRead(200, { ...LIVE_BRIDGE_SURFACES, total: 2 }).passed).toBe(false);
    const badPart = {
      ...LIVE_BRIDGE_SURFACES,
      surfaces: {
        ...LIVE_BRIDGE_SURFACES.surfaces,
        corpusQuery: { ...LIVE_BRIDGE_SURFACES.surfaces.corpusQuery, checksum: "nothex" },
      },
    };
    const r = checkBridgeSurfacesRead(200, badPart);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/not sha256 hex/);
  });

  it("is deterministic: same served parts always recompute the same aggregate", () => {
    const a = checkBridgeSurfacesRead(200, LIVE_BRIDGE_SURFACES);
    const b = checkBridgeSurfacesRead(200, JSON.parse(JSON.stringify(LIVE_BRIDGE_SURFACES)));
    expect(a).toEqual(b);
    expect(a.passed).toBe(true);
  });

  // STE-P-290: standalone evaluator stays tolerant without selfVerify data
  it("passes without cross-surface detail when no bridgeRuntime is supplied (tolerant standalone)", () => {
    const r = checkBridgeSurfacesRead(200, LIVE_BRIDGE_SURFACES);
    expect(r.passed).toBe(true);
    expect(r.detail).not.toMatch(/cross-surface/);
  });

  it("verifies cross-surface identity directly when bridgeRuntime is supplied", () => {
    const rt = {
      compatibility: "BRIDGE_GUARDED",
      checksum: TITAN_FIXTURE_CHECKSUM,
      memoryMode: "memory",
      providerCounts: { validated: 0, configuredUnprobed: 1, missingKey: 0 },
    };
    const ok = checkBridgeSurfacesRead(200, LIVE_BRIDGE_SURFACES, rt);
    expect(ok.passed).toBe(true);
    expect(ok.detail).toMatch(/cross-surface identity vs selfVerify\.bridgeRuntime verified/);
    const drift = checkBridgeSurfacesRead(200, LIVE_BRIDGE_SURFACES, { ...rt, checksum: "b".repeat(64) });
    expect(drift.passed).toBe(false);
    expect(drift.detail).toMatch(/cross-surface drift: titanBridge\.checksum/);
  });

  // STE-P-291: direct evaluator with the manifest cross-surface argument
  it("verifies corpusQuery/manifest identity directly when the manifest is supplied", () => {
    const cm = { sha256: MANIFEST_SHA, docCount: 22500 };
    const ok = checkBridgeSurfacesRead(200, LIVE_BRIDGE_SURFACES, undefined, cm);
    expect(ok.passed).toBe(true);
    expect(ok.detail).toMatch(/cross-surface identity vs corpusQuery\.manifest verified \(sha256\+docCount match\)/);
    const shaDrift = checkBridgeSurfacesRead(200, LIVE_BRIDGE_SURFACES, undefined, { ...cm, sha256: "e".repeat(64) });
    expect(shaDrift.passed).toBe(false);
    expect(shaDrift.detail).toMatch(/cross-surface drift: corpusQuery\.manifestSha256/);
    const docDrift = checkBridgeSurfacesRead(200, LIVE_BRIDGE_SURFACES, undefined, { ...cm, docCount: 9 });
    expect(docDrift.passed).toBe(false);
    expect(docDrift.detail).toMatch(/cross-surface drift: corpusQuery\.corpusDocs/);
  });
});

describe("checkTruthLedgerRead (STE-K-13)", () => {
  it("accepts an empty ledger as an honest state", () => {
    const r = checkTruthLedgerRead(200, { persistence: "POSTGRES", count: 0, snapshots: [] });
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/honest/);
  });

  it("accepts a well-formed populated ledger and counts drift", () => {
    const r = checkTruthLedgerRead(200, LIVE_TRUTH_HISTORY_POPULATED, 2, LEDGER_NOW_MS);
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/1 drift-flagged/);
  });

  it("fails when truthLedgerSummary latest fields diverge from the latest truthHistory snapshot", () => {
    const r = checkTruthLedgerRead(
      200,
      LIVE_TRUTH_HISTORY_POPULATED,
      2,
      LEDGER_NOW_MS,
      undefined,
      { ...LIVE_SUMMARY_POPULATED, latestFingerprint: "c".repeat(64) },
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/latestFingerprint/);
  });

  it("fails when the latest snapshot is stale beyond the hourly freshness threshold", () => {
    const nowMs = Date.parse("2026-07-14T12:00:00.000Z");
    const stale = {
      ...LIVE_TRUTH_HISTORY_POPULATED,
      snapshots: [
        {
          id: 2,
          fingerprint: LEDGER_FP_B,
          claimsMeasured: 19,
          claimsAsserted: 0,
          createdAt: "2026-07-14T09:00:00.000Z",
          drift: true,
        },
        {
          id: 1,
          fingerprint: LEDGER_FP_A,
          claimsMeasured: 19,
          claimsAsserted: 0,
          createdAt: "2026-07-14T08:00:00.000Z",
          drift: false,
        },
      ],
    };
    const r = checkTruthLedgerRead(200, stale, 2, nowMs);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/latest snapshot is stale/);
  });

  it("fails when truthLedgerSummary.count is invalid", () => {
    const r = checkTruthLedgerRead(200, LIVE_TRUTH_HISTORY_POPULATED, -1);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/truthLedgerSummary\.count invalid/);
  });

  it("fails when truthLedgerSummary.count is smaller than the returned window", () => {
    const r = checkTruthLedgerRead(200, LIVE_TRUTH_HISTORY_POPULATED, 1);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/inconsistent total/);
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

  it("fails when returned rows exceed the requested truthHistory limit", () => {
    const r = checkTruthLedgerRead(
      200,
      {
        persistence: "POSTGRES",
        count: 3,
        snapshots: [
          { id: 3, fingerprint: "c".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-03T00:00:00.000Z", drift: false },
          { id: 2, fingerprint: "b".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-02T00:00:00.000Z", drift: false },
          { id: 1, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false },
        ],
      },
      3,
      LEDGER_NOW_MS,
      2,
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/exceed requested limit/);
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

  // STE-K-36: row-schema guard for /truth table-consumed fields.
  it("fails when snapshot id is missing or invalid", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "UNPERSISTED",
      count: 1,
      snapshots: [{ fingerprint: "a".repeat(64), claimsMeasured: 1, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false }],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/id is missing\/invalid/);
  });

  it("fails when snapshot createdAt is missing or invalid", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "UNPERSISTED",
      count: 1,
      snapshots: [{ id: 1, fingerprint: "a".repeat(64), claimsMeasured: 1, claimsAsserted: 0, drift: false }],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/missing\/invalid createdAt/);
  });

  it("fails when predecessorPruned is non-boolean", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "UNPERSISTED",
      count: 1,
      snapshots: [{ id: 1, fingerprint: "a".repeat(64), claimsMeasured: 1, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false, predecessorPruned: "yes" as never }],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/predecessorPruned must be boolean/);
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

  it("fails when genesis row (id=1) is incorrectly marked predecessorPruned", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 1,
      snapshots: [
        { id: 1, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false, predecessorPruned: true },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/genesis row/);
  });

  // ---- STE-K-22: bounded-retention disclosure (deepening; total stays 9) ----
  it("accepts a valid retention disclosure and reports it (genesis retained)", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 1,
      retention: { keep: 168, oldestRetainedId: 1, oldestRetainedIsGenesis: true },
      snapshots: [{ id: 1, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false }],
    });
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/keep=168/);
    expect(r.detail).toMatch(/genesis retained/);
  });

  it("fails when retention.keep is not a positive number", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 0,
      retention: { keep: 0, oldestRetainedId: null, oldestRetainedIsGenesis: false },
      snapshots: [],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/retention\.keep/);
  });

  it("fails when retention oldestRetainedIsGenesis contradicts oldestRetainedId", () => {
    const r = checkTruthLedgerRead(200, {
      ...LIVE_TRUTH_HISTORY_POPULATED,
      retention: { keep: 168, oldestRetainedId: 5, oldestRetainedIsGenesis: true },
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/oldestRetainedIsGenesis=true/);
  });

  it("fails when retention oldestRetainedId is null while snapshots are populated", () => {
    const r = checkTruthLedgerRead(200, {
      ...LIVE_TRUTH_HISTORY_POPULATED,
      retention: { keep: 168, oldestRetainedId: null, oldestRetainedIsGenesis: false },
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/oldestRetainedId invalid/);
  });

  it("fails when truthLedgerSummary retention disagrees with truthHistory retention", () => {
    const r = checkTruthLedgerRead(
      200,
      LIVE_TRUTH_HISTORY_POPULATED,
      2,
      LEDGER_NOW_MS,
      undefined,
      {
        ...LIVE_SUMMARY_POPULATED,
        retention: { keep: 168, oldestRetainedId: 9, oldestRetainedIsGenesis: false },
      },
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/retention\.oldestRetainedId/);
  });

  it("accepts monotonic retention advance between selfVerify and truthHistory reads", () => {
    const r = checkTruthLedgerRead(
      200,
      {
        ...LIVE_TRUTH_HISTORY_POPULATED,
        retention: { keep: 168, oldestRetainedId: 10, oldestRetainedIsGenesis: false },
      },
      2,
      LEDGER_NOW_MS,
      undefined,
      {
        ...LIVE_SUMMARY_POPULATED,
        retention: { keep: 168, oldestRetainedId: 9, oldestRetainedIsGenesis: false },
      },
    );
    expect(r.passed).toBe(true);
  });

  it("fails when the returned page exceeds the retention window", () => {
    const snaps = Array.from({ length: 3 }, (_, k) => ({
      id: 3 - k,
      fingerprint: "a".repeat(64),
      claimsMeasured: 19,
      claimsAsserted: 0,
      createdAt: `2026-01-0${3 - k}T00:00:00.000Z`,
      drift: false,
    }));
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 3,
      retention: { keep: 2, oldestRetainedId: 1, oldestRetainedIsGenesis: true },
      snapshots: snaps,
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/exceeds retention\.keep/);
  });

  it("accepts predecessorPruned NAMED on the oldest snapshot with drift=false", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 2,
      retention: { keep: 168, oldestRetainedId: 40, oldestRetainedIsGenesis: false },
      snapshots: [
        { id: 41, fingerprint: "b".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-02T00:00:00.000Z", drift: true },
        { id: 40, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false, predecessorPruned: true },
      ],
    });
    expect(r.passed).toBe(true);
    expect(r.detail).toMatch(/older pruned/);
  });

  it("fails when predecessorPruned appears on a NON-oldest snapshot", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 2,
      retention: { keep: 168, oldestRetainedId: 40, oldestRetainedIsGenesis: false },
      snapshots: [
        { id: 41, fingerprint: "b".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-02T00:00:00.000Z", drift: true, predecessorPruned: true },
        { id: 40, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: false },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/not the oldest/);
  });

  it("fails when predecessorPruned carries a fabricated drift=true", () => {
    const r = checkTruthLedgerRead(200, {
      persistence: "POSTGRES",
      count: 1,
      retention: { keep: 168, oldestRetainedId: 40, oldestRetainedIsGenesis: false },
      snapshots: [
        { id: 40, fingerprint: "a".repeat(64), claimsMeasured: 19, claimsAsserted: 0, createdAt: "2026-01-01T00:00:00.000Z", drift: true, predecessorPruned: true },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/not measurable once the predecessor is pruned/);
  });
});

// ---- STE-K-20: single-origin gateway proof (deepening, same 9 contracts) ----
describe("gateway single-origin (STE-K-20)", () => {
  it("gatewayBaseUrl shapes the MEASURED full-app mount", () => {
    expect(gatewayBaseUrl()).toBe(`${DEFAULT_GATEWAY_ORIGIN}${GATEWAY_APP_MOUNT}`);
    expect(gatewayBaseUrl()).toBe("https://onx-gateway.onrender.com/intelligence");
    // Custom origin + trailing slash is normalized (no double slash).
    expect(gatewayBaseUrl("https://gw.example.com/")).toBe("https://gw.example.com/intelligence");
  });

  it("every contract URL resolves under the single gateway /intelligence origin", async () => {
    const base = gatewayBaseUrl();
    const seen: string[] = [];
    // Wrap the honest live double, asserting the gateway prefix on EVERY url
    // and that upstream paths are preserved exactly through the mount.
    const inner = liveFetch();
    const gatewayFetch: FetchLike = async (url, init) => {
      seen.push(url);
      expect(url.startsWith(`${DEFAULT_GATEWAY_ORIGIN}${GATEWAY_APP_MOUNT}/`)).toBe(true);
      return inner(url, init);
    };
    const report = await runSmoke(base, {
      fetchImpl: gatewayFetch,
      expectedSha: "810700e",
      committedManifest: COMMITTED_MANIFEST,
    });
    // Same 10 contracts, all green through the gateway origin.
    expect(report.passed).toBe(true);
    expect(report.total).toBe(10);
    expect(report.baseUrl).toBe(base);
    // The four doctrine surface shapes were all reached via the mount:
    expect(seen.some((u) => u === `${base}/health`)).toBe(true);
    expect(seen.some((u) => u === `${base}/truth`)).toBe(true);
    expect(seen.some((u) => u.startsWith(`${base}/api/trpc/onx.selfVerify`))).toBe(true);
    expect(seen.some((u) => u.startsWith(`${base}/api/trpc/providers.status`))).toBe(true);
  });

  it("is deterministic: gateway origin yields identical verdicts to direct origin", async () => {
    const opts = { fetchImpl: liveFetch(), expectedSha: null, committedManifest: COMMITTED_MANIFEST };
    const direct = await runSmoke("https://onx-intelligence-clean.onrender.com", opts);
    const gateway = await runSmoke(gatewayBaseUrl(), { ...opts, fetchImpl: liveFetch() });
    const strip = (r: Awaited<ReturnType<typeof runSmoke>>) =>
      r.contracts.map((c) => ({ name: c.name, passed: c.passed, detail: c.detail }));
    // Verdicts are origin-independent: the gateway is a faithful proxy.
    expect(strip(gateway)).toEqual(strip(direct));
  });

  it("no_key_leak still scans the gateway-served /truth page", async () => {
    // A leaking gateway response must still be caught (guard is origin-agnostic).
    const leaky = html(200, '<div id="root"></div><!-- key=sk-abcdefghijklmnopqrstuvwxyz012345 -->');
    const report = await runSmoke(gatewayBaseUrl(), {
      fetchImpl: liveFetch({ truthPage: leaky }),
      expectedSha: null,
      committedManifest: COMMITTED_MANIFEST,
    });
    expect(report.contracts.find((c) => c.name === "no_key_leak")?.passed).toBe(false);
  });

  it("fails honestly when gateway core facts diverge from a direct parity base (STE-K-58)", async () => {
    const gatewayBase = gatewayBaseUrl("https://gw.example.com");
    const directBase = "https://direct.example.com";
    const shared = liveFetch({
      selfVerify: trpcOk({ ...LIVE_SELFVERIFY, truthLedgerSummary: LIVE_SUMMARY_POPULATED }),
      truthHistory: trpcOk(LIVE_TRUTH_HISTORY_POPULATED),
    });
    const parityFetch: FetchLike = async (url, init) => {
      if (url === `${directBase}/health`) return resp(200, { ...LIVE_HEALTH, commit: "f".repeat(40) });
      if (url.startsWith(`${directBase}/api/trpc/onx.selfVerify`))
        return trpcOk({
          ...LIVE_SELFVERIFY,
          fingerprint: "f".repeat(64),
          truthLedgerSummary: { ...LIVE_SUMMARY_POPULATED, count: 9 },
        });
      if (url.startsWith(`${directBase}/api/trpc/onx.truthHistory`))
        return trpcOk({
          ...LIVE_TRUTH_HISTORY_POPULATED,
          snapshots: [
            { ...LIVE_TRUTH_HISTORY_POPULATED.snapshots[0], fingerprint: "c".repeat(64) },
            LIVE_TRUTH_HISTORY_POPULATED.snapshots[1],
          ],
        });
      return shared(url, init);
    };
    const report = await runSmoke(gatewayBase, {
      fetchImpl: parityFetch,
      expectedSha: "810700e",
      committedManifest: COMMITTED_MANIFEST,
      parityBaseUrl: directBase,
    });
    expect(report.total).toBe(10);
    expect(report.passed).toBe(false);
    expect(report.contracts.find((c) => c.name === "health_live")?.detail).toMatch(/parity mismatch/);
    expect(report.contracts.find((c) => c.name === "honest_status_selfverify")?.detail).toMatch(/parity mismatch/);
    expect(report.contracts.find((c) => c.name === "truth_ledger_read")?.detail).toMatch(/parity mismatch/);
  });
});
