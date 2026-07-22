import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appRouter } from "../router";
import {
  registerSchema,
  getSchema,
  listEventTypes,
  listVersions,
  latestVersion,
  validateEvent,
  recordActivity,
  queryActivity,
  exportActivityLog,
  getBridgeContractStatus,
  ingestThroughContract,
  seedInstitutionalSchemas,
  INSTITUTIONAL_EVENT_TYPES,
  BridgeContractError,
  __resetBridgeContractsForTests,
  type BridgeEvent,
} from "../lib/bridge-contracts";
import type { Provenance } from "../lib/persistent-memory";
import type { PerceptionSourceRow } from "../lib/platform-inbox-store";
import { assertBridgeAccess } from "../bridge-guard";
import { env } from "../lib/env";
import { TRPCError } from "@trpc/server";

const caller = appRouter.createCaller({} as never);

const prov: Provenance = {
  source: "platform-bridge",
  method: "ingest",
  recordedAt: "2026-01-01T00:00:00.000Z",
  confidence: 0.9,
};

function validEvent(overrides: Partial<BridgeEvent> = {}): BridgeEvent {
  return {
    eventType: "pharmacy.dispense.created",
    source: "platform",
    eventId: 101,
    aggregateType: "dispense",
    aggregateId: "D-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    payload: { itemCount: 3 },
    ...overrides,
  };
}

describe("Bridge contract security", () => {
  it("should expose corpus and intent status endpoints", async () => {
    const corpus = await caller.corpusQuery.status();
    const intent = await caller.intentEngine.status();

    expect(corpus.bridge).toBe("corpusQuery");
    expect(intent.bridge).toBe("intentEngine");
    expect(typeof corpus.enabled).toBe("boolean");
    expect(typeof intent.hasSharedSecret).toBe("boolean");
    expect(corpus.access).toBe("PUBLIC_READ");
    expect(intent.access).toBe("PUBLIC_READ");
    expect(["BRIDGE_READY", "BRIDGE_GUARDED"]).toContain(corpus.compatibility);
    expect(["BRIDGE_READY", "BRIDGE_GUARDED"]).toContain(intent.compatibility);
    expect(corpus.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(corpus.corpusDocs).toBe(0); // STE-K-REAL: no templated seed — honest empty until authentic ingest
    expect(corpus.publicSearch.probeQuery).toBe("entropy principles");
    expect(corpus.publicSearch.indexedDocs).toBe(0);
    expect(intent.classify.engine).toBe("RULE_BASED_SAFE");
    expect(intent.classify.mode).toBe("DETERMINISTIC_NO_KEY");
    expect(intent.classify.topIntent).toBe("PRICING");
    expect(intent.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("status proofs should keep stable checksums across identical facts", async () => {
    const corpusA = await caller.corpusQuery.status();
    const corpusB = await caller.corpusQuery.status();
    const intentA = await caller.intentEngine.status();
    const intentB = await caller.intentEngine.status();

    expect(corpusA.checksum).toBe(corpusB.checksum);
    expect(intentA.checksum).toBe(intentB.checksum);
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

// ============================================================
// STE-K-08 hardening — the bridge gate fails closed with HONEST auth
// status codes (TRPCError → 401/403), not a 500 that masks an auth
// rejection as a server error. Live smoke asserts this against the
// deployment; here we lock it deterministically in CI.
// ============================================================
describe("bridge-guard fail-closed HTTP semantics (STE-K-08)", () => {
  const saved = { enabled: env.bridgeEnabled, secret: env.bridgeSharedSecret };
  function ctxWith(key: string | null) {
    return {
      req: { headers: { get: (h: string) => (h === "x-onx-bridge-key" ? key : null) } },
    } as never;
  }
  afterEach(() => {
    env.bridgeEnabled = saved.enabled;
    env.bridgeSharedSecret = saved.secret;
  });

  it("missing/invalid key → TRPCError UNAUTHORIZED (401)", () => {
    env.bridgeEnabled = true;
    env.bridgeSharedSecret = "the-secret";
    try {
      assertBridgeAccess(ctxWith(null));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("UNAUTHORIZED");
      expect((e as TRPCError).message).toMatch(/BRIDGE_UNAUTHORIZED/);
    }
    expect(() => assertBridgeAccess(ctxWith("wrong-key"))).toThrow(/BRIDGE_UNAUTHORIZED/);
  });

  it("bridge disabled → TRPCError FORBIDDEN (403)", () => {
    env.bridgeEnabled = false;
    try {
      assertBridgeAccess(ctxWith("anything"));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("FORBIDDEN");
      expect((e as TRPCError).message).toMatch(/BRIDGE_DISABLED/);
    }
  });

  it("secret not configured → TRPCError FORBIDDEN (403)", () => {
    env.bridgeEnabled = true;
    env.bridgeSharedSecret = "";
    try {
      assertBridgeAccess(ctxWith("anything"));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("FORBIDDEN");
      expect((e as TRPCError).message).toMatch(/BRIDGE_SECRET_NOT_CONFIGURED/);
    }
  });

  it("valid key → passes (no throw)", () => {
    env.bridgeEnabled = true;
    env.bridgeSharedSecret = "the-secret";
    expect(() => assertBridgeAccess(ctxWith("the-secret"))).not.toThrow();
  });
});

// ============================================================
// validation for all institutional types + unified activity log
// (provenance, reuses B4 MemoryStore) + perception-adapter linkage.
// ============================================================
describe("B8 schema registry — versioning", () => {
  beforeEach(() => __resetBridgeContractsForTests());

  it("seeds a v1 schema for every institutional event type", () => {
    seedInstitutionalSchemas();
    const types = listEventTypes();
    expect(types.length).toBe(INSTITUTIONAL_EVENT_TYPES.length);
    for (const et of INSTITUTIONAL_EVENT_TYPES) {
      const schema = getSchema(et);
      expect(schema).not.toBeNull();
      expect(schema?.version).toBe(1);
      expect(schema?.aggregate).toBe(et.split(".")[0]);
    }
  });

  it("keeps old versions and resolves latest by default", () => {
    seedInstitutionalSchemas();
    registerSchema({
      eventType: "pharmacy.dispense.created",
      version: 2,
      aggregate: "pharmacy",
      fields: {
        eventId: { type: "number", required: true },
        aggregateType: { type: "string", required: true },
        aggregateId: { type: "string", required: true },
        occurredAt: { type: "timestamp", required: true },
        "payload.itemCount": { type: "number", required: true },
      },
    });
    expect(latestVersion("pharmacy.dispense.created")).toBe(2);
    expect(listVersions("pharmacy.dispense.created")).toEqual([1, 2]);
    expect(getSchema("pharmacy.dispense.created")?.version).toBe(2);
    expect(getSchema("pharmacy.dispense.created", 1)?.version).toBe(1);
  });

  it("is fail-closed on malformed schema registration", () => {
    expect(() =>
      registerSchema({ eventType: "", version: 1, aggregate: "x", fields: {} }),
    ).toThrow(BridgeContractError);
    expect(() =>
      registerSchema({ eventType: "x.y", version: 0, aggregate: "x", fields: {} }),
    ).toThrow(BridgeContractError);
    expect(() =>
      registerSchema({
        eventType: "x.y",
        version: 1,
        aggregate: "x",
        // @ts-expect-error invalid field type on purpose
        fields: { a: { type: "nope", required: true } },
      }),
    ).toThrow(BridgeContractError);
  });

  it("rejects a conflicting redefinition of the same version", () => {
    registerSchema({
      eventType: "x.y",
      version: 1,
      aggregate: "x",
      fields: { a: { type: "string", required: true } },
    });
    expect(() =>
      registerSchema({
        eventType: "x.y",
        version: 1,
        aggregate: "x",
        fields: { a: { type: "number", required: true } },
      }),
    ).toThrow(BridgeContractError);
  });
});

describe("B8 validation — fail-closed for all institutional types", () => {
  beforeEach(() => {
    __resetBridgeContractsForTests();
    seedInstitutionalSchemas();
  });

  it("accepts a well-formed event for every institutional type", () => {
    for (const eventType of INSTITUTIONAL_EVENT_TYPES) {
      const result = validateEvent(validEvent({ eventType }));
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    }
  });

  it("rejects an unknown event type (fail-closed)", () => {
    const result = validateEvent(validEvent({ eventType: "unknown.event.type" }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("UNKNOWN_EVENT_TYPE");
  });

  it("rejects an unknown schema version", () => {
    const result = validateEvent(validEvent({ version: 99 }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("UNKNOWN_VERSION");
  });

  it("rejects a missing required field", () => {
    const ev = validEvent();
    // drop a required field
    delete (ev as unknown as Record<string, unknown>).aggregateId;
    const result = validateEvent(ev);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_FIELD" && e.field === "aggregateId")).toBe(true);
  });

  it("rejects a wrong field type", () => {
    const result = validateEvent(validEvent({ eventId: "not-a-number" as unknown as number }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "TYPE_MISMATCH" && e.field === "eventId")).toBe(true);
  });

  it("rejects a non-ISO timestamp", () => {
    const result = validateEvent(validEvent({ occurredAt: "not-a-date" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "occurredAt")).toBe(true);
  });

  it("enforces a v2 payload field only under v2 (versioned validation)", () => {
    registerSchema({
      eventType: "pharmacy.dispense.created",
      version: 2,
      aggregate: "pharmacy",
      fields: {
        eventId: { type: "number", required: true },
        aggregateType: { type: "string", required: true },
        aggregateId: { type: "string", required: true },
        occurredAt: { type: "timestamp", required: true },
        "payload.batchId": { type: "string", required: true },
      },
    });
    const missingBatch = validEvent({ version: 2 });
    expect(validateEvent(missingBatch).valid).toBe(false);
    // v1 still passes without the v2 field
    expect(validateEvent(validEvent({ version: 1 })).valid).toBe(true);
    // v2 passes once the required payload field is present
    const withBatch = validEvent({ version: 2, payload: { batchId: "B-9" } });
    expect(validateEvent(withBatch).valid).toBe(true);
  });
});

describe("B8 unified activity log — provenance (reuses B4 MemoryStore)", () => {
  beforeEach(() => {
    __resetBridgeContractsForTests();
    seedInstitutionalSchemas();
  });

  it("records a valid event with provenance and exports it for audit", async () => {
    const res = await recordActivity({ event: validEvent(), provenance: prov });
    expect(res.accepted).toBe(true);
    expect(res.record?.provenance).toEqual(prov);
    const log = await exportActivityLog();
    expect(log.count).toBe(1);
  });

  it("does NOT record an invalid event (fail-closed) and counts the rejection", async () => {
    const res = await recordActivity({
      event: validEvent({ eventType: "unknown.event.type" }),
      provenance: prov,
    });
    expect(res.accepted).toBe(false);
    const log = await exportActivityLog();
    expect(log.count).toBe(0);
    const status = await getBridgeContractStatus();
    expect(status.rejectedCount).toBe(1);
  });

  it("requires provenance — reuses MemoryStore validation (fail-closed)", async () => {
    await expect(
      recordActivity({ event: validEvent(), provenance: undefined as unknown as Provenance }),
    ).rejects.toThrow();
  });

  it("is idempotent on replay of the same event occurrence", async () => {
    const first = await recordActivity({ event: validEvent(), provenance: prov });
    const second = await recordActivity({ event: validEvent(), provenance: prov });
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    const log = await exportActivityLog();
    expect(log.count).toBe(1);
  });

  it("queries activity by event type", async () => {
    await recordActivity({ event: validEvent({ eventType: "billing.invoice.created" }), provenance: prov });
    await recordActivity({ event: validEvent({ eventType: "lab.result.created" }), provenance: prov });
    const rows = await queryActivity("billing.invoice.created");
    expect(rows.length).toBe(1);
    expect(rows[0].provenance).toEqual(prov);
  });
});

describe("B8 perception-adapter linkage (reuse, not duplicate)", () => {
  beforeEach(() => {
    __resetBridgeContractsForTests();
    seedInstitutionalSchemas();
  });

  function row(overrides: Partial<PerceptionSourceRow> = {}): PerceptionSourceRow {
    return {
      id: 7,
      source: "platform",
      eventId: 55,
      eventType: "clinic.appointment.completed",
      aggregateType: "appointment",
      aggregateId: "A-55",
      occurredAt: "2026-01-01T00:00:00.000Z",
      receivedAt: "2026-01-01T00:00:01.000Z",
      payloadKeys: ["patientId", "clinicId"],
      ...overrides,
    };
  }

  it("validates + logs then yields the SAME perception object as the adapter transform", async () => {
    const res = await ingestThroughContract(row(), prov);
    expect(res.accepted).toBe(true);
    expect(res.perception?.type).toBe("PERCEPTION");
    expect(res.perception?.id).toBe("perc-platform-55");
    const log = await exportActivityLog();
    expect(log.count).toBe(1);
  });

  it("blocks an event with an unknown contract (fail-closed, no perception)", async () => {
    const res = await ingestThroughContract(row({ eventType: "rogue.event.injected" }), prov);
    expect(res.accepted).toBe(false);
    expect(res.perception).toBeUndefined();
    const status = await getBridgeContractStatus();
    expect(status.rejectedCount).toBe(1);
  });
});

describe("B8 tRPC surface", () => {
  beforeEach(() => {
    __resetBridgeContractsForTests();
    seedInstitutionalSchemas();
  });

  it("exposes status with the bridge state and registry counts", async () => {
    const status = await caller.bridgeContracts.status();
    expect(status.bridge).toBe("bridgeContracts");
    expect(status.eventTypeCount).toBe(INSTITUTIONAL_EVENT_TYPES.length);
    expect(typeof status.enabled).toBe("boolean");
  });

  it("validates an event through the router", async () => {
    const ok = await caller.bridgeContracts.validate(validEvent());
    expect(ok.valid).toBe(true);
    const bad = await caller.bridgeContracts.validate(validEvent({ eventType: "nope.x" }));
    expect(bad.valid).toBe(false);
  });

  it("records and queries activity through the router", async () => {
    const rec = await caller.bridgeContracts.record({ event: validEvent(), provenance: prov });
    expect(rec.accepted).toBe(true);
    const rows = await caller.bridgeContracts.activity({ eventType: "pharmacy.dispense.created" });
    expect(rows.length).toBe(1);
  });
});
