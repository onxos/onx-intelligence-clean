// ============================================================
// CORPUS PERSISTENCE PROOF — memory-mode (keyless, deterministic)
// ------------------------------------------------------------
// The live-pg round-trip is proven separately (skip-guarded) in
// corpus-pg-persistence.test.ts, which runs against a real Postgres
// in CI. Here we prove the HONEST fallback contract that runs in the
// keyless gate: with no postgres DATABASE_URL the proof must report
// mode="memory" and NEVER claim persistence=POSTGRES.
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { corpusPersistenceProof } from "../lib/corpus-health";

describe("corpusPersistenceProof — memory fallback (no postgres)", () => {
  const prev = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  });

  it("reports memory mode and NEVER claims POSTGRES without a pg round-trip", async () => {
    const proof = await corpusPersistenceProof();
    expect(proof.mode).toBe("memory");
    expect(proof.persistence).toBe("MEMORY");
    expect(proof.persistence).not.toBe("POSTGRES");
    expect(proof.roundTrip).toBe(false);
    expect(proof.writtenBack).toBe(false);
  });

  it("attempts no pg write in memory mode (no probe id, no latency)", async () => {
    const proof = await corpusPersistenceProof();
    expect(proof.probeId).toBeNull();
    expect(proof.latencyMs).toBeNull();
    expect(proof.error).toBeUndefined();
  });

  it("returns a stable, non-sensitive shape with an ISO timestamp", async () => {
    const proof = await corpusPersistenceProof();
    expect(typeof proof.note).toBe("string");
    expect(proof.note.length).toBeGreaterThan(0);
    expect(() => new Date(proof.checkedAt).toISOString()).not.toThrow();
    expect(new Date(proof.checkedAt).toISOString()).toBe(proof.checkedAt);
    // Never leaks corpus contents — only the small proof envelope keys.
    expect(Object.keys(proof).sort()).toEqual(
      [
        "checkedAt",
        "latencyMs",
        "mode",
        "note",
        "persistence",
        "probeId",
        "roundTrip",
        "writtenBack",
      ].sort(),
    );
  });

  it("honestly credits durable-pg to CI in its note (no prod-sqlite claim)", async () => {
    const proof = await corpusPersistenceProof();
    expect(proof.note).toMatch(/in-memory/i);
    expect(proof.note).toMatch(/CI/);
    expect(proof.note.toLowerCase()).not.toContain("postgres ok");
  });
});
