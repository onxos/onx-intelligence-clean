// ============================================================
// STE-K-17 — Truth page view-model tests. Deterministic, node-only,
// no DOM, no network, no LLM. These inject data into buildTruthPageModel
// (the exact state the RTL page paints) to prove every honest state:
//   populated, DEMO disclosure badge, drift=true, honestly-empty ledger,
//   and a distinct fail-honest FETCH_FAILED (never a fake zero).
// ============================================================
import { describe, it, expect } from "vitest";
import {
  buildTruthPageModel,
  shortHash,
  type TruthPageSources,
  type SelfVerifyData,
  type CorpusManifestData,
  type ProvidersStatusData,
  type CommitData,
} from "../lib/truth-page-model";

const FROZEN = () => "2026-01-01T00:00:00.000Z";

function selfVerify(overrides: Partial<SelfVerifyData> = {}): SelfVerifyData {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    items: [
      { area: "health", name: "db", verdict: "IMPLEMENTED_PROVEN", measured: true, detail: "ok" },
      { area: "corpus", name: "Knowledge corpus", verdict: "DEMO", measured: true, detail: "demo" },
    ],
    health: [],
    corpus: {} as never,
    providers: [],
    bridges: [
      { id: "corpusQuery", enabled: false, hasSharedSecret: false, failClosed: true },
      { id: "intentEngine", enabled: false, hasSharedSecret: false, failClosed: true },
      { id: "titanBridge", enabled: false, hasSharedSecret: false, failClosed: true },
    ],
    runtime: { node: "v20", uptimeSeconds: 1, rssMb: 1 },
    claimsMeasured: 2,
    claimsAsserted: 0,
    fingerprint: "abcdef0123456789abcdef",
    truthLedgerSummary: {
      state: "POPULATED",
      persistence: "POSTGRES",
      count: 3,
      latestFingerprint: "bb642469aaaa1111bbbb",
      capturedAt: "2026-01-01T00:00:00.000Z",
      claimsMeasured: 19,
      claimsAsserted: 0,
      drift: false,
      retention: { keep: 168, oldestRetainedId: 1, oldestRetainedIsGenesis: true },
    },
    ...overrides,
  } as SelfVerifyData;
}

function corpus(overrides: Partial<CorpusManifestData> = {}): CorpusManifestData {
  return {
    version: "1.0",
    source: "templated seed (ONX Knowledge Base v1.0)",
    docCount: 22500,
    domains: ["MEDICINE", "STRATEGY", "SCIENCE"],
    provenance: "TEMPLATED_SEED",
    disclosure: "DEMO",
    templatedDocs: 22500,
    authenticDocs: 0,
    sha256: "6fc2bed87d86e4cfc195020cd34c148cee96348797b413bba60baac7c3372f08",
    ...overrides,
  } as CorpusManifestData;
}

function providers(overrides: Partial<ProvidersStatusData> = {}): ProvidersStatusData {
  return {
    rateLimit: { limit: 60, persistence: "PER_INSTANCE_UNPERSISTED" } as never,
    providers: [{ id: "openai", status: "CONFIGURED_UNPROBED" }],
    ...overrides,
  };
}

function commit(overrides: Partial<CommitData> = {}): CommitData {
  return {
    commit: "8658d65140454b905f788a37e2231beeb58b707b",
    service: "onx-intelligence-clean",
    bootTime: "2026-01-01T00:00:00.000Z",
    timestamp: "2026-01-01T00:05:00.000Z",
    ...overrides,
  };
}

function allOk(): TruthPageSources {
  return {
    selfVerify: { ok: true, data: selfVerify() },
    corpus: { ok: true, data: corpus() },
    providers: { ok: true, data: providers() },
    commit: { ok: true, data: commit() },
  };
}

describe("STE-K-17 truth page view-model", () => {
  it("renders a fully POPULATED model with measured claims, bridges and ledger", () => {
    const m = buildTruthPageModel(allOk(), FROZEN);
    expect(m.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(m.claims.state).toBe("OK");
    expect(m.claims.claimsMeasured).toBe(2);
    expect(m.claims.claimsAsserted).toBe(0);
    expect(m.claims.itemCount).toBe(2);
    expect(m.claims.fingerprintShort).toBe("abcdef012345"); // 12 chars
    expect(m.bridges.state).toBe("OK");
    expect(m.bridges.items).toHaveLength(3);
    expect(m.bridges.items.every((b) => b.failClosed)).toBe(true);
    expect(m.ledger.state).toBe("OK");
    expect(m.ledger.count).toBe(3);
    expect(m.ledger.latestFingerprintShort).toBe("bb642469aaaa");
    expect(m.rateLimit.state).toBe("OK");
    expect(m.rateLimit.persistence).toBe("PER_INSTANCE_UNPERSISTED");
  });

  it("surfaces the honest DEMO disclosure badge with short sha", () => {
    const m = buildTruthPageModel(allOk(), FROZEN);
    expect(m.corpus.state).toBe("OK");
    expect(m.corpus.disclosure).toBe("DEMO");
    expect(m.corpus.provenance).toBe("TEMPLATED_SEED");
    expect(m.corpus.sha256Short).toBe("6fc2bed87d86");
    expect(m.corpus.docCount).toBe(22500);
    expect(m.corpus.domainCount).toBe(3);
  });

  it("reflects a REAL disclosure when the measured corpus flips", () => {
    const src = allOk();
    src.corpus = { ok: true, data: corpus({ disclosure: "REAL", provenance: "AUTHENTIC_INGEST", templatedDocs: 0, authenticDocs: 100 }) };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.corpus.disclosure).toBe("REAL");
    expect(m.corpus.provenance).toBe("AUTHENTIC_INGEST");
  });

  it("shows the drift badge when the latest snapshot drifted (drift=true)", () => {
    const src = allOk();
    src.selfVerify = {
      ok: true,
      data: selfVerify({
        truthLedgerSummary: {
          state: "POPULATED",
          persistence: "POSTGRES",
          count: 5,
          latestFingerprint: "ffff2222cccc3333",
          capturedAt: "2026-01-02T00:00:00.000Z",
          claimsMeasured: 19,
          claimsAsserted: 0,
          drift: true,
          retention: { keep: 168, oldestRetainedId: 1, oldestRetainedIsGenesis: true },
        },
      }),
    };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.ledger.state).toBe("OK");
    expect(m.ledger.drift).toBe(true);
    expect(m.ledger.count).toBe(5);
    expect(m.ledger.latestFingerprintShort).toBe("ffff2222cccc");
  });

  it("names an honestly EMPTY ledger (not a failure, not fabricated history)", () => {
    const src = allOk();
    src.selfVerify = {
      ok: true,
      data: selfVerify({
        truthLedgerSummary: {
          state: "EMPTY",
          persistence: "POSTGRES",
          count: 0,
          latestFingerprint: null,
          capturedAt: null,
          claimsMeasured: null,
          claimsAsserted: null,
          drift: false,
          retention: { keep: 168, oldestRetainedId: null, oldestRetainedIsGenesis: false },
        },
      }),
    };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.ledger.state).toBe("EMPTY");
    expect(m.ledger.count).toBe(0);
    expect(m.ledger.latestFingerprintShort).toBeNull();
    expect(m.ledger.drift).toBeNull();
    // claims/bridges from the same live surface stay OK — empty ledger ≠ dead surface
    expect(m.claims.state).toBe("OK");
    expect(m.bridges.state).toBe("OK");
  });

  it("marks a FETCH FAILURE as a distinct fail-honest state, never a fake zero", () => {
    const src: TruthPageSources = {
      selfVerify: { ok: false, error: "network: 503" },
      corpus: { ok: false, error: "timeout" },
      providers: { ok: false, error: "parse error" },
      commit: { ok: false, error: "commit surface 502" },
    };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.claims.state).toBe("FETCH_FAILED");
    expect(m.claims.error).toBe("network: 503");
    expect(m.claims.claimsMeasured).toBeNull(); // NOT 0 — honest absence
    expect(m.corpus.state).toBe("FETCH_FAILED");
    expect(m.corpus.disclosure).toBeNull();
    expect(m.ledger.state).toBe("FETCH_FAILED");
    expect(m.ledger.count).toBeNull();
    expect(m.rateLimit.state).toBe("FETCH_FAILED");
    expect(m.bridges.state).toBe("FETCH_FAILED");
    expect(m.bridges.items).toHaveLength(0);
    expect(m.freshness.state).toBe("FETCH_FAILED");
    expect(m.freshness.commitShort).toBeNull(); // NOT a fake sha
  });

  it("mixes states independently — one dead surface does not poison the others", () => {
    const src = allOk();
    src.corpus = { ok: false, error: "corpus surface 500" };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.corpus.state).toBe("FETCH_FAILED");
    expect(m.claims.state).toBe("OK"); // selfVerify still alive
    expect(m.rateLimit.state).toBe("OK"); // providers still alive
  });

  it("shortHash is deterministic and null-safe", () => {
    expect(shortHash("abcdef0123456789", 12)).toBe("abcdef012345");
    expect(shortHash(null)).toBeNull();
    expect(shortHash(undefined)).toBeNull();
  });

  it("is deterministic across two runs with an injected clock", () => {
    const a = buildTruthPageModel(allOk(), FROZEN);
    const b = buildTruthPageModel(allOk(), FROZEN);
    expect(a).toEqual(b);
  });

  // ---- STE-K-23: bounded-retention card for the human reader ----
  it("discloses the MEASURED retention window (genesis retained edge)", () => {
    const m = buildTruthPageModel(allOk(), FROZEN);
    expect(m.retention.state).toBe("OK");
    expect(m.retention.disclosed).toBe(true);
    expect(m.retention.keep).toBe(168);
    expect(m.retention.oldestRetainedId).toBe(1);
    expect(m.retention.oldestRetainedIsGenesis).toBe(true);
  });

  it("shows the pruned-edge honestly when older snapshots were trimmed", () => {
    const src = allOk();
    src.selfVerify = {
      ok: true,
      data: selfVerify({
        truthLedgerSummary: {
          state: "POPULATED",
          persistence: "POSTGRES",
          count: 168,
          latestFingerprint: "ffff2222cccc3333",
          capturedAt: "2026-01-02T00:00:00.000Z",
          claimsMeasured: 19,
          claimsAsserted: 0,
          drift: false,
          retention: { keep: 168, oldestRetainedId: 42, oldestRetainedIsGenesis: false },
        },
      }),
    };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.retention.state).toBe("OK");
    expect(m.retention.oldestRetainedId).toBe(42);
    expect(m.retention.oldestRetainedIsGenesis).toBe(false); // predecessor pruned → named edge
  });

  it("names a stale deploy that omits retention (not a fabricated policy, not a fetch failure)", () => {
    const src = allOk();
    const stale = selfVerify();
    // simulate a pre-K-22 deployment: the summary answered but has no retention field
    delete (stale.truthLedgerSummary as { retention?: unknown }).retention;
    src.selfVerify = { ok: true, data: stale };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.retention.state).toBe("EMPTY");
    expect(m.retention.disclosed).toBe(false);
    expect(m.retention.keep).toBeNull();
    // the ledger card itself still renders from the same live surface
    expect(m.ledger.state).toBe("OK");
  });

  it("marks retention FETCH_FAILED when the self-verify surface is unreachable", () => {
    const src = allOk();
    src.selfVerify = { ok: false, error: "network: 503" };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.retention.state).toBe("FETCH_FAILED");
    expect(m.retention.disclosed).toBe(false);
    expect(m.retention.keep).toBeNull();
    expect(m.retention.error).toBe("network: 503");
  });

  it("rate-limit persistence reflects the MEASURED store (POSTGRES_PERSISTED)", () => {
    const src = allOk();
    src.providers = { ok: true, data: providers({ rateLimit: { limit: 60, persistence: "POSTGRES_PERSISTED" } as never }) };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.rateLimit.state).toBe("OK");
    expect(m.rateLimit.persistence).toBe("POSTGRES_PERSISTED");
  });

  // ---- STE-K-27: deploy-freshness card (measured from /commit) ----
  it("discloses the MEASURED served commit + boot time from /commit", () => {
    const m = buildTruthPageModel(allOk(), FROZEN);
    expect(m.freshness.state).toBe("OK");
    expect(m.freshness.commitShort).toBe("8658d6514045"); // 12-char short of the served sha
    expect(m.freshness.service).toBe("onx-intelligence-clean");
    expect(m.freshness.bootTime).toBe("2026-01-01T00:00:00.000Z");
  });

  it("names an EMPTY freshness state when the surface omits commit (never a fake sha)", () => {
    const src = allOk();
    src.commit = { ok: true, data: commit({ commit: undefined }) };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.freshness.state).toBe("EMPTY");
    expect(m.freshness.commitShort).toBeNull();
    // a partial surface still passes through the fields it DID carry
    expect(m.freshness.service).toBe("onx-intelligence-clean");
  });

  it("marks freshness FETCH_FAILED when the /commit surface is unreachable, not a fake zero", () => {
    const src = allOk();
    src.commit = { ok: false, error: "commit surface 502" };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.freshness.state).toBe("FETCH_FAILED");
    expect(m.freshness.error).toBe("commit surface 502");
    expect(m.freshness.commitShort).toBeNull();
    expect(m.freshness.bootTime).toBeNull();
    // a dead /commit does not poison the other live surfaces
    expect(m.claims.state).toBe("OK");
    expect(m.ledger.state).toBe("OK");
  });

  it("rides bootTime through null-honest when the surface omits it", () => {
    const src = allOk();
    src.commit = { ok: true, data: commit({ bootTime: undefined }) };
    const m = buildTruthPageModel(src, FROZEN);
    expect(m.freshness.state).toBe("OK");
    expect(m.freshness.bootTime).toBeNull();
    expect(m.freshness.commitShort).toBe("8658d6514045");
  });
});
