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
