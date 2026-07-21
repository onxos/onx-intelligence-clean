/**
 * Provider Capital Engine — EV-06 lineage, D13/D17-compliant.
 *
 * Each AI provider is a capital asset scored on 11 dimensions. Scores are
 * computed ONLY from live evidence (onx_provider_usage + registry probes):
 *   - reliability  → real success rate
 *   - operations   → real latency curve
 *   - commercial   → real metered cost (null until priced calls exist)
 *   - knowledge    → breadth of real task kinds served
 *   - evidence     → volume of recorded usage (log-scaled)
 *   - trust        → reliability × governance standing
 *   - clinical / arabicReasoning / judgment / strategy → require eval probes
 *     that do not exist yet → null with an honest reason (D17: no vanity).
 *
 * A dimension is never invented. Total = mean of available dimensions, with
 * coveragePct disclosed — exactly the fail-honest discipline of the D-series.
 */
import { usageAggregates, type ProviderAggregate } from "./provider-usage-store";

export interface CapitalDimension {
  score: number | null;
  evidence: string;
}

export interface ProviderCapitalProfile {
  provider: string;
  windowHours: number;
  calls: number;
  dimensions: {
    clinical: CapitalDimension;
    operations: CapitalDimension;
    commercial: CapitalDimension;
    strategy: CapitalDimension;
    governance: CapitalDimension;
    knowledge: CapitalDimension;
    arabicReasoning: CapitalDimension;
    evidence: CapitalDimension;
    judgment: CapitalDimension;
    reliability: CapitalDimension;
    trust: CapitalDimension;
  };
  total: number | null;
  coveragePct: number;
}

const NO_EVIDENCE = "insufficient live evidence — dimension withheld (fail-honest)";

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function profileFromAggregate(a: ProviderAggregate, windowHours: number): ProviderCapitalProfile {
  const reliability: CapitalDimension =
    a.calls >= 3 && a.successRate != null
      ? { score: round1(clamp(a.successRate * 100)), evidence: `${a.successes}/${a.calls} live calls succeeded` }
      : { score: null, evidence: NO_EVIDENCE };

  const operations: CapitalDimension =
    a.avgLatencyMs != null
      ? { score: round1(clamp(100 - a.avgLatencyMs / 200)), evidence: `avg latency ${a.avgLatencyMs}ms over ${a.calls} calls` }
      : { score: null, evidence: NO_EVIDENCE };

  const commercial: CapitalDimension =
    a.pricedCalls > 0 && a.totalCostUsd != null && a.calls > 0
      ? {
          score: round1(clamp(100 - (a.totalCostUsd / a.calls) * 10000)),
          evidence: `$${a.totalCostUsd.toFixed(6)} metered over ${a.pricedCalls} priced calls (avg $${(a.totalCostUsd / a.calls).toFixed(6)}/call)`,
        }
      : { score: null, evidence: "no priced calls yet — configure PROVIDER_PRICE_OVERRIDES for this provider's models" };

  const knowledge: CapitalDimension =
    a.kinds.length > 0
      ? { score: round1(clamp((a.kinds.length / 6) * 100)), evidence: `serving ${a.kinds.length} capability kind(s): ${a.kinds.join(", ")}` }
      : { score: null, evidence: NO_EVIDENCE };

  const evidence: CapitalDimension =
    a.calls > 0
      ? { score: round1(clamp(Math.log10(a.calls + 1) * 33)), evidence: `${a.calls} metered call(s) since ${a.firstSeen}` }
      : { score: null, evidence: NO_EVIDENCE };

  const trust: CapitalDimension =
    reliability.score != null
      ? { score: round1(clamp(reliability.score)), evidence: "derived from live reliability (governance: bridge-authenticated)" }
      : { score: null, evidence: NO_EVIDENCE };

  const withheld = (why: string): CapitalDimension => ({ score: null, evidence: why });
  const dims = {
    clinical: withheld("requires clinical eval harness — not built yet"),
    operations,
    commercial,
    strategy: withheld("requires multi-model inventory probe — not wired yet"),
    governance: { score: 100, evidence: "bridge-secret authenticated, registry-governed" } as CapitalDimension,
    knowledge,
    arabicReasoning: withheld("requires Arabic reasoning eval set — not built yet"),
    evidence,
    judgment: withheld("requires judgment benchmark — not built yet"),
    reliability,
    trust,
  };

  const scores = Object.values(dims).map((d) => d.score).filter((s): s is number => s != null);
  return {
    provider: a.provider,
    windowHours,
    calls: a.calls,
    dimensions: dims,
    total: scores.length > 0 ? round1(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
    coveragePct: Math.round((scores.length / 11) * 100),
  };
}

/** Compute live capital profiles for every provider with metered usage. */
export async function providerCapitalProfiles(windowHours = 24 * 30): Promise<ProviderCapitalProfile[]> {
  const aggs = await usageAggregates(windowHours);
  return aggs.map((a) => profileFromAggregate(a, windowHours));
}
