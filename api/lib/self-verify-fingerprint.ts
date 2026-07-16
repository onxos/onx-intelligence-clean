// ============================================================
// SELF-VERIFY FINGERPRINT — STE-P-293 shared canonical helper
// The report fingerprint is the anchor every truth-ledger
// snapshot stores and drift detection compares. This module is
// the SINGLE source of its computation, used by BOTH the server
// (self-verify.ts fingerprintReport) and the live smoke contract
// (honest_status_selfverify RECOMPUTES it from served sections)
// — so a forged-but-well-formed fingerprint can never pass.
// Pure node:crypto — no other dependencies. The normalized
// payload key order below is FROZEN: it byte-matches the
// historical fingerprintReport serialization, so live
// fingerprints (and every ledger snapshot already recorded)
// are unchanged by this refactor.
// ============================================================
import { createHash } from "node:crypto";

export interface SelfVerifyFingerprintInput {
  items: ReadonlyArray<{ area: string; name: string; verdict: string; measured: boolean }>;
  health: ReadonlyArray<{ name: string; status: string }>;
  corpus: { rawTotal: number; uniqueByTitleBody: number; duplicates: number; persistence: string };
  providers: ReadonlyArray<{ id: string; status: string }>;
  bridges: ReadonlyArray<{ id: string; enabled: boolean; hasSharedSecret: boolean; failClosed: boolean }>;
  bridgeRuntime: {
    bridge: string;
    bridgeEnabled: boolean;
    hasSharedSecret: boolean;
    providerCounts: { validated: number; configuredUnprobed: number; missingKey: number };
    memoryMode: string;
    compatibility: string;
    commitSha: string | null;
    checksum: string;
  };
  claimsMeasured: number;
  claimsAsserted: number;
}

// Normalized fingerprint: stable across calls with identical facts —
// volatile fields (timestamps, latencies, uptime, memory) excluded.
// Every section is REBUILT here in the frozen canonical key order from
// semantic fields, so wire key order can never influence the digest.
export function computeSelfVerifyFingerprint(input: SelfVerifyFingerprintInput): string {
  const stable = {
    items: input.items.map((i) => ({ area: i.area, name: i.name, verdict: i.verdict, measured: i.measured })),
    health: input.health.map((h) => ({ name: h.name, status: h.status })),
    corpus: {
      rawTotal: input.corpus.rawTotal,
      uniqueByTitleBody: input.corpus.uniqueByTitleBody,
      duplicates: input.corpus.duplicates,
      persistence: input.corpus.persistence,
    },
    providers: input.providers.map((p) => ({ id: p.id, status: p.status })),
    bridges: input.bridges.map((b) => ({
      id: b.id,
      enabled: b.enabled,
      hasSharedSecret: b.hasSharedSecret,
      failClosed: b.failClosed,
    })),
    bridgeRuntime: {
      bridge: input.bridgeRuntime.bridge,
      bridgeEnabled: input.bridgeRuntime.bridgeEnabled,
      hasSharedSecret: input.bridgeRuntime.hasSharedSecret,
      providerCounts: {
        validated: input.bridgeRuntime.providerCounts.validated,
        configuredUnprobed: input.bridgeRuntime.providerCounts.configuredUnprobed,
        missingKey: input.bridgeRuntime.providerCounts.missingKey,
      },
      memoryMode: input.bridgeRuntime.memoryMode,
      compatibility: input.bridgeRuntime.compatibility,
      commitSha: input.bridgeRuntime.commitSha,
      checksum: input.bridgeRuntime.checksum,
    },
    claimsMeasured: input.claimsMeasured,
    claimsAsserted: input.claimsAsserted,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}
