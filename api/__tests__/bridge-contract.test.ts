import { describe, it, expect } from "vitest";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as any);

describe("Bridge contract security", () => {
  it("should expose corpus and intent status endpoints", async () => {
    const corpus = await caller.corpusQuery.status();
    const intent = await caller.intentEngine.status();

    expect(corpus.bridge).toBe("corpusQuery");
    expect(intent.bridge).toBe("intentEngine");
    expect(typeof corpus.enabled).toBe("boolean");
    expect(typeof intent.hasSharedSecret).toBe("boolean");
  });

  it("should block corpusQuery search when bridge is disabled", async () => {
    const status = await caller.corpusQuery.status();
    if (status.enabled) return;

    await expect(
      caller.corpusQuery.search({ query: "ONX", limit: 3 }),
    ).rejects.toThrow(/BRIDGE_DISABLED/);
  });

  it("should block intentEngine analyze when bridge is disabled", async () => {
    const status = await caller.intentEngine.status();
    if (status.enabled) return;

    await expect(
      caller.intentEngine.analyze({ content: "bridge intent dry-run" }),
    ).rejects.toThrow(/BRIDGE_DISABLED/);
  });
});
