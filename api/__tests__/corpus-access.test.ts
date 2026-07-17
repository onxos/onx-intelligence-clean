import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../router";
import { clearIucSnapshots, replaceIurgObjects } from "../lib/iurg-store";
import { buildCorpusObjects, type CorpusSeed } from "../lib/corpus";
import { accessBreakdown, canAccess, filterByClearance, recordTier } from "../lib/corpus-access";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";
import type { IurgObjectInput } from "../iuc-engine";

const caller = appRouter.createCaller({} as any);

function rec(id: string, tier?: "PUBLIC" | "INTERNAL" | "RESTRICTED"): IurgObjectInput {
  return { id, type: "PERCEPTION", contentText: `content ${id}`, accessTier: tier };
}

describe("corpus access control (clearance tiers)", () => {
  it("defaults a record with no tier to PUBLIC", () => {
    expect(recordTier(rec("corpus-x"))).toBe("PUBLIC");
  });

  it("enforces clearance >= tier for reads", () => {
    expect(canAccess("PUBLIC", "PUBLIC")).toBe(true);
    expect(canAccess("PUBLIC", "INTERNAL")).toBe(false);
    expect(canAccess("PUBLIC", "RESTRICTED")).toBe(false);
    expect(canAccess("INTERNAL", "INTERNAL")).toBe(true);
    expect(canAccess("INTERNAL", "RESTRICTED")).toBe(false);
    expect(canAccess("RESTRICTED", "RESTRICTED")).toBe(true);
    expect(canAccess("RESTRICTED", "PUBLIC")).toBe(true);
  });

  it("filters a pool to what a clearance may read, order-preserved", () => {
    const pool = [rec("corpus-a"), rec("corpus-b", "INTERNAL"), rec("corpus-c", "RESTRICTED")];
    expect(filterByClearance(pool, "PUBLIC").map((o) => o.id)).toEqual(["corpus-a"]);
    expect(filterByClearance(pool, "INTERNAL").map((o) => o.id)).toEqual(["corpus-a", "corpus-b"]);
    expect(filterByClearance(pool, "RESTRICTED").map((o) => o.id)).toEqual(["corpus-a", "corpus-b", "corpus-c"]);
    // Default clearance is PUBLIC.
    expect(filterByClearance(pool).map((o) => o.id)).toEqual(["corpus-a"]);
  });

  it("produces a measured, honest access breakdown", () => {
    const pool = [rec("corpus-a"), rec("corpus-b", "INTERNAL"), rec("corpus-c", "RESTRICTED")];
    const pub = accessBreakdown(pool, "PUBLIC");
    expect(pub).toMatchObject({
      clearance: "PUBLIC",
      total: 3,
      visible: 1,
      withheld: 2,
      byTier: { PUBLIC: 1, INTERNAL: 1, RESTRICTED: 1 },
      withheldByTier: { PUBLIC: 0, INTERNAL: 1, RESTRICTED: 1 },
    });
    expect(accessBreakdown(pool, "RESTRICTED").withheld).toBe(0);
  });
});

describe.sequential("corpus access-control router enforcement", () => {
  const restrictedSeed: CorpusSeed = {
    contentText: "Founder constitutional directive codenamed zeta governs restricted sovereignty escalations",
    type: "UNDERSTANDING",
    verification: "CONFIRMED",
    provenance: { type: "AUTHORED", citation: "ONX Constitution: Directive Zeta", sourceAuthority: "ONX Founder" },
    sources: 3,
    trust: 0.95,
    domainTag: "GOVERNANCE",
    accessTier: "RESTRICTED",
  };
  const internalSeed: CorpusSeed = {
    contentText: "Internal operational runbook codenamed omega for staged rollout coordination",
    type: "PATTERN",
    verification: "PROBABLE",
    provenance: { type: "AUTHORED", citation: "ONX Ops Runbook: Omega", sourceAuthority: "ONX Operations" },
    sources: 2,
    trust: 0.8,
    domainTag: "OPERATIONS",
    accessTier: "INTERNAL",
  };
  const built = buildCorpusObjects([...CURATED_VET_CORPUS, restrictedSeed, internalSeed]);
  const publicCount = CURATED_VET_CORPUS.length;

  beforeEach(async () => {
    await replaceIurgObjects([]);
    await clearIucSnapshots();
  });

  it("iuc.corpusAccess reports measured visible/withheld per clearance", async () => {
    await replaceIurgObjects(built);
    const pub = await caller.iuc.corpusAccess({ clearance: "PUBLIC" });
    expect(pub.total).toBe(built.length);
    expect(pub.visible).toBe(publicCount);
    expect(pub.withheld).toBe(2);
    expect(pub.withheldByTier).toEqual({ PUBLIC: 0, INTERNAL: 1, RESTRICTED: 1 });

    const restricted = await caller.iuc.corpusAccess({ clearance: "RESTRICTED" });
    expect(restricted.visible).toBe(built.length);
    expect(restricted.withheld).toBe(0);
  });

  it("hides restricted records from an under-cleared lexical search, reveals them with clearance", async () => {
    await replaceIurgObjects(built);
    const asPublic = await caller.iuc.corpusSearch({ query: "zeta", clearance: "PUBLIC" });
    expect(asPublic.withheld).toBe(2);
    expect(asPublic.results.length).toBe(0);

    const asRestricted = await caller.iuc.corpusSearch({ query: "zeta", clearance: "RESTRICTED" });
    expect(asRestricted.results.length).toBeGreaterThan(0);
    expect(asRestricted.results[0].citation).toMatch(/zeta/i);
  });

  it("enforces clearance in tf-idf vector search too", async () => {
    await replaceIurgObjects(built);
    const asPublic = await caller.iuc.corpusVectorSearch({ query: "zeta directive", clearance: "PUBLIC" });
    expect(asPublic.results.every((r) => !/zeta/i.test(r.citation ?? ""))).toBe(true);

    const asRestricted = await caller.iuc.corpusVectorSearch({ query: "zeta directive", clearance: "RESTRICTED" });
    expect(asRestricted.results.some((r) => /zeta/i.test(r.citation ?? ""))).toBe(true);
  });

  it("defaults to PUBLIC clearance when none is supplied", async () => {
    await replaceIurgObjects(built);
    const res = await caller.iuc.corpusSearch({ query: "zeta" });
    expect(res.clearance).toBe("PUBLIC");
    expect(res.results.length).toBe(0);
  });
});
