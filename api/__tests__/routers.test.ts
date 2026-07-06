import { describe, expect, it } from "vitest";
import { appRouter } from "../root";

const caller = appRouter.createCaller({});

describe("Core datasets", () => {
  it("returns healthy pong", async () => {
    const result = await caller.health.ping();
    expect(result.pong).toBe(true);
  });

  it("returns 7 constitutional principles", async () => {
    const principles = await caller.constitution.principles();
    expect(principles).toHaveLength(7);
  });

  it("returns 5 titans", async () => {
    const titans = await caller["titan-bridge"].listTitans();
    expect(titans).toHaveLength(5);
  });

  it("returns 50 skills", async () => {
    const skills = await caller.skills.list();
    expect(skills).toHaveLength(50);
  });

  it("returns 22500 knowledge records in stats", async () => {
    const stats = await caller.knowledge.stats();
    expect(stats.totalRecords).toBe(22500);
  });
});
