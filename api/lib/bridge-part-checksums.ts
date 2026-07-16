// ============================================================
// STE-P-292 — canonical PER-BRIDGE checksums for the three public
// bridge surfaces (corpusQuery / intentEngine / titanBridge).
//
// SINGLE SOURCE OF TRUTH shared by two sides (same pattern as
// bridge-surfaces-checksum.ts, P289):
//   1. the SERVER (bridge-surface-proof.ts / bridge-runtime-proof.ts)
//      computes each served per-bridge checksum with these exact
//      functions, and
//   2. the LIVE SMOKE contract (bridge_surfaces_read) RECOMPUTES each
//      per-bridge checksum from the served semantic fields with the
//      same functions — a forged-but-well-formed per-bridge checksum
//      can never pass.
//
// The payload key ORDER below is frozen: it reproduces byte-for-byte
// the JSON.stringify payloads the server historically hashed, so the
// live checksum values are unchanged by this refactor.
//
// Pure module: node:crypto only, no server/store dependencies, so the
// smoke-contracts CLI path stays dependency-light and deterministic.
// ============================================================
import { createHash } from "node:crypto";

function sha256Json(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export interface CorpusBridgeChecksumInput {
  enabled: boolean;
  hasSharedSecret: boolean;
  compatibility: string;
  persistence: string;
  manifestSha256: string;
  corpusDocs: number;
  publicSearch: {
    engine: string;
    indexedDocs: number;
    probeQuery: string;
    totalMatches: number;
  };
}

export function computeCorpusBridgeChecksum(input: CorpusBridgeChecksumInput): string {
  return sha256Json({
    enabled: input.enabled,
    hasSharedSecret: input.hasSharedSecret,
    compatibility: input.compatibility,
    persistence: input.persistence,
    manifestSha256: input.manifestSha256,
    corpusDocs: input.corpusDocs,
    publicSearch: {
      engine: input.publicSearch.engine,
      indexedDocs: input.publicSearch.indexedDocs,
      probeQuery: input.publicSearch.probeQuery,
      totalMatches: input.publicSearch.totalMatches,
    },
  });
}

export interface IntentBridgeChecksumInput {
  enabled: boolean;
  hasSharedSecret: boolean;
  compatibility: string;
  classify: {
    engine: string;
    mode: string;
    probeText: string;
    topIntent: string;
    topConfidence: number;
    tokenCount: number;
  };
}

export function computeIntentBridgeChecksum(input: IntentBridgeChecksumInput): string {
  return sha256Json({
    enabled: input.enabled,
    hasSharedSecret: input.hasSharedSecret,
    compatibility: input.compatibility,
    classify: {
      engine: input.classify.engine,
      mode: input.classify.mode,
      probeText: input.classify.probeText,
      topIntent: input.classify.topIntent,
      topConfidence: input.classify.topConfidence,
      tokenCount: input.classify.tokenCount,
    },
  });
}

export interface TitanBridgeChecksumInput {
  enabled: boolean;
  hasSharedSecret: boolean;
  providerCounts: {
    validated: number;
    configuredUnprobed: number;
    missingKey: number;
  };
  memoryMode: string;
}

export function computeTitanBridgeChecksum(input: TitanBridgeChecksumInput): string {
  // Historical payload key is `bridgeEnabled` (bridge-runtime-proof.ts).
  return sha256Json({
    bridgeEnabled: input.enabled,
    hasSharedSecret: input.hasSharedSecret,
    providerCounts: {
      validated: input.providerCounts.validated,
      configuredUnprobed: input.providerCounts.configuredUnprobed,
      missingKey: input.providerCounts.missingKey,
    },
    memoryMode: input.memoryMode,
  });
}
