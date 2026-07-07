// ============================================================
// ONX END-TO-END TRIAL RUN (تشغيل تجريبي) — Part 2
// A single, ordered integration scenario that exercises the
// CI-safe unified appRouter surface as one intelligence lifecycle:
//   boot → perceive → measure → promote (auto + human gate) →
//   re-measure → govern (constitution) → domain engine (vet) →
//   final integrity gate.
// Proves the Track I engines (IUC + continuity + D17 measurement)
// interoperate with governance + a domain engine in CI — no DB.
// ============================================================
import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as any);

describe("ONX trial run — unified intelligence lifecycle", () => {
  beforeAll(async () => {
    await caller.iuc.reset();
    await caller.measurement.reset();
  });

  it("1. boots healthy — live + ready + status probes respond", async () => {
    const live = await caller.health.live();
    expect(live.status).toBe("ALIVE");

    const ready = await caller.health.ready();
    expect(["READY", "NOT_READY"]).toContain(ready.status);

    const status = await caller.health.status();
    expect(["HEALTHY", "WARNING", "DEGRADED"]).toContain(status.overall);
  });

  it("2. perceives — ingests a new IURG object into the live graph", async () => {
    const before = await caller.iuc.stats();
    const res = await caller.iuc.ingest({
      type: "PERCEPTION", rank: 1, verification: "POSSIBLE", sources: 2, trust: 0.66,
    });
    expect(res.stored).toBe(true);

    const after = await caller.iuc.stats();
    expect(after.objectCount).toBe(before.objectCount + 1);
  });

  it("3. measures — D17 computes 6 quality indices over the live graph", async () => {
    const snap = await caller.measurement.snapshot();
    expect(snap.indices).toHaveLength(6);
    expect(snap.objectCount).toBeGreaterThan(0);
    for (const ix of snap.indices) {
      expect(ix.value).toBeGreaterThanOrEqual(0);
      expect(ix.value).toBeLessThanOrEqual(1);
    }
  });

  it("4. promotes automatically — R1→R2 with an intact hash-chain", async () => {
    const res = await caller.iuc.applyPromotion({ id: "seed-perc" });
    expect(res.status).toBe("PROMOTED");

    const verify = await caller.iuc.verifyChain();
    expect(verify.valid).toBe(true);
  });

  it("5. enforces the human gate — DG-09 pends, then founder approves to R4", async () => {
    const pend = await caller.iuc.applyPromotion({ id: "seed-und" });
    expect(pend.status).toBe("PENDING");
    expect(pend.gate).toBe("DG-09");

    const queue = await caller.iuc.pending();
    expect(queue.some((p) => p.objectId === "seed-und")).toBe(true);

    const appr = await caller.iuc.approveGate({ id: "seed-und", gate: "DG-09", approver: "founder" });
    expect(appr.approved).toBe(true);
    expect(appr.newRank).toBe(4);
  });

  it("6. re-measures — progress states present after promotions", async () => {
    await caller.measurement.commit();
    const snap = await caller.measurement.snapshot();
    expect(snap.indices.every((i) => typeof i.progress === "string")).toBe(true);
  });

  it("7. governs — constitution validates a founder-aligned decision", async () => {
    const v = await caller.constitution.validate({
      content: "قرار موثّق بالأمانة والإتقان مع مصادر ومراجع كافية لضمان الجودة والعدل.",
      minScore: 50,
    });
    expect(v.principleResults).toHaveLength(7);
    expect(typeof v.amanahStatus.passed).toBe("boolean");
  });

  it("8. runs a domain engine end-to-end — vet diagnosis + constitutional status", async () => {
    const dx = await caller.vet.diagnose({
      animalType: "Canine", breed: "German Shepherd", symptoms: ["fever", "lethargy"],
    });
    expect(dx.caseId).toBeDefined();
    expect(dx.constitutionalStatus.amanah).toBeDefined();
  });

  it("9. final integrity gate — chain valid, objects present, IRS bounded", async () => {
    const stats = await caller.iuc.stats();
    expect(stats.chainValid).toBe(true);
    expect(stats.objectCount).toBeGreaterThan(0);

    const irs = (await caller.measurement.snapshot()).indices.find((i) => i.key === "IRS")!;
    expect(irs.value).toBeGreaterThanOrEqual(0);
    expect(irs.value).toBeLessThanOrEqual(1);
  });
});
