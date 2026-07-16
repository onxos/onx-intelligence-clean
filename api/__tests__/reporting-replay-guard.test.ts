import { describe, expect, it } from "vitest";
import { buildReplayFingerprint, shouldEmitEvidence } from "../lib/reporting-replay-guard";

describe("reporting replay guard (STE-RCV-V2)", () => {
  it("returns stable fingerprint for same inputs", () => {
    const a = buildReplayFingerprint({
      sourceSha: "src-sha",
      testSha: "test-sha",
      configSha: "cfg-sha",
      incidentSchemaSha: "schema-sha",
    });
    const b = buildReplayFingerprint({
      sourceSha: "src-sha",
      testSha: "test-sha",
      configSha: "cfg-sha",
      incidentSchemaSha: "schema-sha",
    });
    expect(a).toBe(b);
  });

  it("blocks duplicate evidence emission on cache hit", () => {
    const fp = buildReplayFingerprint({
      sourceSha: "s1",
      testSha: "t1",
      configSha: "c1",
      incidentSchemaSha: "i1",
    });
    expect(shouldEmitEvidence(fp, fp)).toBe(false);
  });

  it("emits evidence when any input fingerprint changes", () => {
    const current = buildReplayFingerprint({
      sourceSha: "s2",
      testSha: "t1",
      configSha: "c1",
      incidentSchemaSha: "i1",
    });
    const cached = buildReplayFingerprint({
      sourceSha: "s1",
      testSha: "t1",
      configSha: "c1",
      incidentSchemaSha: "i1",
    });
    expect(shouldEmitEvidence(current, cached)).toBe(true);
  });
});
