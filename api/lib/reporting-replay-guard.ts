import { createHash } from "node:crypto";

export type ReplayInputs = {
  sourceSha: string;
  testSha: string;
  configSha: string;
  incidentSchemaSha: string;
};

export function buildReplayFingerprint(inputs: ReplayInputs): string {
  const payload = `${inputs.sourceSha}|${inputs.testSha}|${inputs.configSha}|${inputs.incidentSchemaSha}`;
  return createHash("sha256").update(payload).digest("hex");
}

export function shouldEmitEvidence(currentFingerprint: string, cachedFingerprint?: string | null): boolean {
  if (!cachedFingerprint) return true;
  return currentFingerprint !== cachedFingerprint;
}
