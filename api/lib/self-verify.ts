// ============================================================
// OSVA SELF-VERIFICATION — STE-V-01 "Unified honest self-audit"
// Aggregates every existing truth measurement into ONE report:
//   live health components + corpus manifest + provider tri-state
//   + fail-closed bridge states + runtime facts.
// Every item carries a five-truth verdict:
//   IMPLEMENTED_PROVEN — measured live right now
//   PARTIAL            — measured but resource degraded/incomplete
//   DOCUMENTED_ONLY    — declared in config/docs, not read by code
//   DEMO               — templated/synthetic data, not authentic
//   MISSING            — resource absent
// claimsMeasured vs claimsAsserted are counted; the report is
// fingerprinted (sha256 of normalized JSON without timestamps).
// NO env values are ever included — keyPrefix (4 chars) at most.
// ============================================================
import { createHash } from "node:crypto";
import { collectComponents, type ComponentHealth } from "../health-router";
import { buildCorpusManifest, type CorpusManifest } from "../knowledge-router";
import { getProviderStates, type ProviderState } from "./provider-registry";
import { getBridgeState } from "../bridge-guard";

export type TruthVerdict =
  | "IMPLEMENTED_PROVEN"
  | "PARTIAL"
  | "DOCUMENTED_ONLY"
  | "DEMO"
  | "MISSING";

export interface VerifiedItem {
  area: string;
  name: string;
  verdict: TruthVerdict;
  // true when the verdict comes from a live measurement (not an assertion)
  measured: boolean;
  detail: string;
}

export interface SelfVerificationReport {
  generatedAt: string;
  items: VerifiedItem[];
  health: ComponentHealth[];
  corpus: CorpusManifest;
  providers: ProviderState[];
  bridges: Array<{ id: string; enabled: boolean; hasSharedSecret: boolean; failClosed: true }>;
  runtime: { node: string; uptimeSeconds: number; rssMb: number };
  claimsMeasured: number;
  claimsAsserted: number;
  fingerprint: string;
}

function healthVerdict(component: ComponentHealth): TruthVerdict {
  switch (component.status) {
    case "HEALTHY":
      return "IMPLEMENTED_PROVEN";
    case "DEGRADED":
    case "UNHEALTHY":
      return "PARTIAL";
    case "UNAVAILABLE":
      return "MISSING";
  }
}

// Normalized fingerprint: stable across calls with identical facts —
// volatile fields (timestamps, latencies, uptime, memory) excluded.
export function fingerprintReport(report: Omit<SelfVerificationReport, "fingerprint">): string {
  const stable = {
    items: report.items.map((i) => ({ area: i.area, name: i.name, verdict: i.verdict, measured: i.measured })),
    health: report.health.map((h) => ({ name: h.name, status: h.status })),
    corpus: {
      rawTotal: report.corpus.rawTotal,
      uniqueByTitleBody: report.corpus.uniqueByTitleBody,
      duplicates: report.corpus.duplicates,
      persistence: report.corpus.persistence,
    },
    providers: report.providers.map((p) => ({ id: p.id, status: p.status })),
    bridges: report.bridges,
    claimsMeasured: report.claimsMeasured,
    claimsAsserted: report.claimsAsserted,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export async function buildSelfVerification(): Promise<SelfVerificationReport> {
  const health = await collectComponents();
  const corpus = buildCorpusManifest();
  const providers = getProviderStates();
  const bridgeState = getBridgeState();
  const bridges = ["corpusQuery", "intentEngine", "titanBridge"].map((id) => ({
    id,
    ...bridgeState,
    failClosed: true as const,
  }));

  const items: VerifiedItem[] = [];

  for (const component of health) {
    items.push({
      area: "health",
      name: component.name,
      verdict: healthVerdict(component),
      measured: true,
      detail: component.message,
    });
  }

  items.push({
    area: "corpus",
    name: "Knowledge corpus",
    // Measured live, but the seeded content is templated — DEMO until
    // the authentic archive is recovered (STE-REC-06).
    verdict: "DEMO",
    measured: true,
    detail: `${corpus.rawTotal} raw / ${corpus.uniqueByTitleBody} unique / ${corpus.duplicates} dups — templated seed, persistence=${corpus.persistence} (see docs/CORPUS_GAP_REPORT.md)`,
  });

  for (const provider of providers) {
    items.push({
      area: "providers",
      name: provider.id,
      verdict:
        provider.status === "VALIDATED"
          ? "IMPLEMENTED_PROVEN"
          : provider.status === "CONFIGURED_UNPROBED"
            ? "PARTIAL"
            : "MISSING",
      // Env-key presence/absence is itself a live measurement; the
      // verdict (not this flag) carries the unproven-connectivity truth.
      measured: true,
      detail: `status=${provider.status}${provider.keyPrefix ? ` keyPrefix=${provider.keyPrefix}` : ""}`,
    });
  }

  for (const bridge of bridges) {
    items.push({
      area: "bridges",
      name: bridge.id,
      verdict: bridge.enabled && bridge.hasSharedSecret ? "IMPLEMENTED_PROVEN" : "DOCUMENTED_ONLY",
      measured: true,
      detail: `fail-closed guard, enabled=${bridge.enabled}, hasSharedSecret=${bridge.hasSharedSecret}`,
    });
  }

  const runtime = {
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  };
  items.push({
    area: "runtime",
    name: "process",
    verdict: "IMPLEMENTED_PROVEN",
    measured: true,
    detail: `node=${runtime.node}`,
  });

  const claimsMeasured = items.filter((i) => i.measured).length;
  const claimsAsserted = items.length - claimsMeasured;

  const withoutFingerprint = {
    generatedAt: new Date().toISOString(),
    items,
    health,
    corpus,
    providers,
    bridges,
    runtime,
    claimsMeasured,
    claimsAsserted,
  };

  return { ...withoutFingerprint, fingerprint: fingerprintReport(withoutFingerprint) };
}
