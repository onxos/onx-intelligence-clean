import { createHash } from "node:crypto";
import { getBridgeState } from "../bridge-guard";
import { getProviderStates } from "./provider-registry";
import { PgVectorMemoryStore } from "./persistent-memory";

export interface BridgeRuntimeProof {
  bridge: "titanBridge";
  bridgeEnabled: boolean;
  hasSharedSecret: boolean;
  providerCounts: {
    validated: number;
    configuredUnprobed: number;
    missingKey: number;
  };
  memoryMode: "pg" | "memory";
  compatibility: "BRIDGE_READY" | "BRIDGE_GUARDED";
  commitSha: string | null;
  checksum: string;
  timestamp: string;
}

export interface TitanBridgeStatusProof {
  access: "PUBLIC_READ";
  bridge: "titanBridge";
  enabled: boolean;
  hasSharedSecret: boolean;
  compatibility: "BRIDGE_READY" | "BRIDGE_GUARDED";
  providerCounts: BridgeRuntimeProof["providerCounts"];
  memoryMode: BridgeRuntimeProof["memoryMode"];
  checksum: string;
  timestamp: string;
  mode: "ACTIVE" | "SAFE_DISABLED";
  message: string;
}

export function getRuntimeBridgeDeltaEvidence(): BridgeRuntimeProof {
  const bridge = getBridgeState();
  const providers = getProviderStates();
  const providerCounts = {
    validated: providers.filter((p) => p.status === "VALIDATED").length,
    configuredUnprobed: providers.filter((p) => p.status === "CONFIGURED_UNPROBED").length,
    missingKey: providers.filter((p) => p.status === "MISSING_KEY").length,
  };
  const memory = new PgVectorMemoryStore({ connectionString: process.env.DATABASE_URL }).getStatus();
  const payload = {
    bridgeEnabled: bridge.enabled,
    hasSharedSecret: bridge.hasSharedSecret,
    providerCounts,
    memoryMode: memory.mode,
  };
  const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return {
    bridge: "titanBridge",
    ...payload,
    compatibility: bridge.enabled && bridge.hasSharedSecret ? "BRIDGE_READY" : "BRIDGE_GUARDED",
    commitSha: process.env.RENDER_GIT_COMMIT ?? process.env.GITHUB_SHA ?? null,
    checksum,
    timestamp: new Date().toISOString(),
  };
}

export function getTitanBridgeStatusProof(): TitanBridgeStatusProof {
  const proof = getRuntimeBridgeDeltaEvidence();
  return {
    access: "PUBLIC_READ",
    bridge: "titanBridge",
    enabled: proof.bridgeEnabled,
    hasSharedSecret: proof.hasSharedSecret,
    compatibility: proof.compatibility,
    providerCounts: proof.providerCounts,
    memoryMode: proof.memoryMode,
    checksum: proof.checksum,
    timestamp: proof.timestamp,
    mode: proof.bridgeEnabled ? "ACTIVE" : "SAFE_DISABLED",
    message: proof.bridgeEnabled
      ? "Bridge is enabled for cross-repo integration traffic"
      : "Bridge is disabled by default. Set BRIDGE_ENABLED=true after V6 gate approval.",
  };
}
