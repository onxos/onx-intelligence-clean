import { createHash } from "node:crypto";
import { getBridgeState } from "../bridge-guard";
import { getCorpusContentManifest } from "./corpus-manifest";
import { searchCorpus } from "./corpus-search";
import { isCorpusPersistenceConfigured } from "./corpus-pg-store";
import { classifyIntent } from "./intent-engine";

type BridgeCompatibility = "BRIDGE_READY" | "BRIDGE_GUARDED";

function getCompatibility(enabled: boolean, hasSharedSecret: boolean): BridgeCompatibility {
  return enabled && hasSharedSecret ? "BRIDGE_READY" : "BRIDGE_GUARDED";
}

export interface CorpusBridgeSurfaceProof {
  bridge: "corpusQuery";
  access: "PUBLIC_READ";
  enabled: boolean;
  hasSharedSecret: boolean;
  compatibility: BridgeCompatibility;
  persistence: "POSTGRES" | "UNPERSISTED";
  manifestSha256: string;
  corpusDocs: number;
  publicSearch: {
    engine: string;
    indexedDocs: number;
    probeQuery: string;
    totalMatches: number;
  };
  checksum: string;
  timestamp: string;
}

export interface IntentBridgeSurfaceProof {
  bridge: "intentEngine";
  access: "PUBLIC_READ";
  enabled: boolean;
  hasSharedSecret: boolean;
  compatibility: BridgeCompatibility;
  classify: {
    engine: string;
    mode: string;
    probeText: string;
    topIntent: string;
    topConfidence: number;
    tokenCount: number;
  };
  checksum: string;
  timestamp: string;
}

export async function getCorpusBridgeSurfaceProof(): Promise<CorpusBridgeSurfaceProof> {
  const state = getBridgeState();
  const manifest = await getCorpusContentManifest();
  const probeQuery = "entropy principles";
  const result = await searchCorpus(probeQuery, { limit: 1 });
  const payload = {
    enabled: state.enabled,
    hasSharedSecret: state.hasSharedSecret,
    compatibility: getCompatibility(state.enabled, state.hasSharedSecret),
    persistence: isCorpusPersistenceConfigured() ? ("POSTGRES" as const) : ("UNPERSISTED" as const),
    manifestSha256: manifest.sha256,
    corpusDocs: manifest.docCount,
    publicSearch: {
      engine: result.engine,
      indexedDocs: result.indexedDocs,
      probeQuery,
      totalMatches: result.totalMatches,
    },
  };
  return {
    bridge: "corpusQuery",
    access: "PUBLIC_READ",
    ...payload,
    checksum: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    timestamp: new Date().toISOString(),
  };
}

export function getIntentBridgeSurfaceProof(): IntentBridgeSurfaceProof {
  const state = getBridgeState();
  const probeText = "كم سعر التطعيم؟";
  const result = classifyIntent(probeText, 3);
  const top = result.results[0];
  const payload = {
    enabled: state.enabled,
    hasSharedSecret: state.hasSharedSecret,
    compatibility: getCompatibility(state.enabled, state.hasSharedSecret),
    classify: {
      engine: result.engine,
      mode: result.mode,
      probeText,
      topIntent: top?.intent ?? "INFO",
      topConfidence: top?.confidence ?? 0,
      tokenCount: result.tokenCount,
    },
  };
  return {
    bridge: "intentEngine",
    access: "PUBLIC_READ",
    ...payload,
    checksum: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    timestamp: new Date().toISOString(),
  };
}
