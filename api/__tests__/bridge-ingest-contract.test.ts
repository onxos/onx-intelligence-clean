// ============================================================
// BRIDGE INGEST CONTRACT — G1 + G4 (live ingest gated by B8 contracts)
//
// Closes the proven ingest gap: `titan.ingestEvent` used to validate only
// the zod SHAPE and then insert straight into the platform inbox, bypassing
// the B8 institutional contracts entirely — an unknown event type or a
// missing/mistyped identity field entered the inbox silently.
//
// G1: every live event now passes the SAME fail-closed `validateEvent`
//     (B8) BEFORE `insertEvent`. Reuse, not duplication — the gate calls
//     `admitLiveEvent` (bridge-contracts), which idempotently seeds the
//     institutional schemas, runs `validateEvent`, and counts rejections
//     through B8's own `rejectedCount`. Invalid events are rejected and
//     NEVER reach the store.
//
// G4: contract replay — fixtures mirror the real forwarder payload shape
//     (intelligence-forwarder in onx-mono):
//       { eventId:number, eventType, aggregateType, aggregateId,
//         occurredAt:ISO, payload }
//     and prove (a) real institutional events pass v1, (b) unknown types /
//     missing identity fields are rejected, (c) the live ingest path itself
//     rejects them before the store.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  validateEvent,
  seedInstitutionalSchemas,
  __resetBridgeContractsForTests,
  getBridgeContractStatus,
  type BridgeEvent,
} from "../lib/bridge-contracts";
import { ingestThroughBridgeContract } from "../titan-bridge-router";
import type {
  InsertEventInput,
  InsertEventResult,
} from "../lib/platform-inbox-store";

// A literal copy of the real forwarder payload shape (onx-mono
// intelligence-forwarder): the 22 registered institutional types are sent
// with numeric eventId + string identity fields + ISO occurredAt + payload.
function realEvent(overrides: Partial<BridgeEvent> = {}): BridgeEvent {
  return {
    source: "platform",
    eventId: 1001,
    eventType: "pharmacy.dispense.created",
    aggregateType: "dispense",
    aggregateId: "disp-5501",
    occurredAt: "2026-07-12T08:15:00.000Z",
    payload: { itemCount: 3, pharmacistId: "ph-22" },
    ...overrides,
  };
}

// 4 distinct real institutional types across different domains.
const REAL_SAMPLES: BridgeEvent[] = [
  realEvent(),
  realEvent({
    eventId: 2002,
    eventType: "billing.invoice.overdue",
    aggregateType: "invoice",
    aggregateId: "inv-7781",
    payload: { amountDue: 940.5, daysOverdue: 34 },
  }),
  realEvent({
    eventId: 3003,
    eventType: "crm.appointment.noshow",
    aggregateType: "appointment",
    aggregateId: "apt-3120",
    payload: { patientId: "pt-88", clinic: "derma" },
  }),
  realEvent({
    eventId: 4004,
    eventType: "insurance.claim.approved",
    aggregateType: "claim",
    aggregateId: "clm-6600",
    payload: { approvedAmount: 1200 },
  }),
];

// A recording fake store — deterministic, keyless, no DB. Lets us assert both
// the forwarded payload AND that rejected events NEVER reach the store.
function fakeStore() {
  const calls: InsertEventInput[] = [];
  const insert = async (e: InsertEventInput): Promise<InsertEventResult> => {
    calls.push(e);
    return { duplicate: false, id: 900 + calls.length };
  };
  return { insert, calls };
}

beforeEach(() => {
  __resetBridgeContractsForTests();
  seedInstitutionalSchemas();
});

// --- G4(a): real forwarder payloads pass validateEvent v1 ----------------

describe("B8 contract replay — real forwarder payloads pass validateEvent v1 (G4a)", () => {
  it("accepts every real institutional sample against its v1 contract", () => {
    for (const ev of REAL_SAMPLES) {
      const r = validateEvent(ev);
      expect(
        r.valid,
        `${ev.eventType} should be valid but got ${JSON.stringify(r.errors)}`,
      ).toBe(true);
      expect(r.version).toBe(1);
      expect(r.errors).toHaveLength(0);
    }
  });
});

// --- G4(b): fail-closed rejections at the contract level ------------------

describe("B8 contract replay — fail-closed rejections (G4b)", () => {
  it("rejects an UNREGISTERED event type", () => {
    const r = validateEvent(realEvent({ eventType: "ghost.event.unknown" }));
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe("UNKNOWN_EVENT_TYPE");
  });

  it("rejects a real type with a MISSING identity field (aggregateId dropped)", () => {
    const bad = realEvent();
    delete (bad as Partial<BridgeEvent>).aggregateId;
    const r = validateEvent(bad);
    expect(r.valid).toBe(false);
    expect(
      r.errors.some((e) => e.field === "aggregateId" && e.code === "MISSING_FIELD"),
    ).toBe(true);
  });

  it("rejects a real type with a WRONG-TYPE identity field (eventId as string)", () => {
    const r = validateEvent(
      realEvent({ eventId: "not-a-number" as unknown as number }),
    );
    expect(r.valid).toBe(false);
    expect(
      r.errors.some((e) => e.field === "eventId" && e.code === "TYPE_MISMATCH"),
    ).toBe(true);
  });
});

// --- G1 + G4(c): the live ingest gate is fail-closed before the store -----

describe("live ingest gate — contract-checked before the inbox (G1 + G4c)", () => {
  it("admits a valid real event and forwards it to the store, preserving the {accepted,duplicate,id} success shape", async () => {
    const store = fakeStore();
    const res = await ingestThroughBridgeContract(
      {
        source: "platform",
        eventId: 5005,
        eventType: "pharmacy.dispense.created",
        aggregateType: "dispense",
        aggregateId: "disp-9",
        occurredAt: "2026-07-12T09:00:00.000Z",
        payload: { itemCount: 1 },
      },
      store.insert,
    );
    expect(res).toEqual({ accepted: true, duplicate: false, id: 901 });
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].eventType).toBe("pharmacy.dispense.created");
    expect(store.calls[0].eventId).toBe(5005);
  });

  it("REJECTS an unknown event type and NEVER calls the store (fail-closed)", async () => {
    const store = fakeStore();
    const res = await ingestThroughBridgeContract(
      {
        source: "platform",
        eventId: 6006,
        eventType: "ghost.unknown.type",
        aggregateType: "x",
        aggregateId: "y",
        occurredAt: "2026-07-12T09:00:00.000Z",
        payload: {},
      },
      store.insert,
    );
    expect(res.accepted).toBe(false);
    if (res.accepted === false) {
      expect(res.rejected).toBe(true);
      expect(res.errors[0].code).toBe("UNKNOWN_EVENT_TYPE");
      expect(res.eventType).toBe("ghost.unknown.type");
    }
    expect(store.calls).toHaveLength(0);
  });

  it("REJECTS an event with a broken identity field and NEVER calls the store", async () => {
    const store = fakeStore();
    const res = await ingestThroughBridgeContract(
      {
        source: "platform",
        eventId: 7007,
        eventType: "billing.invoice.overdue",
        aggregateType: "invoice",
        aggregateId: "", // empty identity → fails the string contract
        occurredAt: "2026-07-12T09:00:00.000Z",
        payload: {},
      },
      store.insert,
    );
    expect(res.accepted).toBe(false);
    expect(store.calls).toHaveLength(0);
  });

  it("counts live rejections through the B8 registry's own rejectedCount (no duplicate bookkeeping)", async () => {
    const before = (await getBridgeContractStatus()).rejectedCount;
    const store = fakeStore();
    await ingestThroughBridgeContract(
      {
        source: "platform",
        eventId: 8008,
        eventType: "ghost.unknown.type",
        aggregateType: "x",
        aggregateId: "y",
        occurredAt: "2026-07-12T09:00:00.000Z",
        payload: {},
      },
      store.insert,
    );
    const after = (await getBridgeContractStatus()).rejectedCount;
    expect(after).toBe(before + 1);
  });

  it("is self-sufficient: gates correctly even with NO external seeding (self-seeds the institutional contracts)", async () => {
    __resetBridgeContractsForTests(); // wipe the registry — no external seed
    const store = fakeStore();
    const res = await ingestThroughBridgeContract(
      {
        source: "platform",
        eventId: 9009,
        eventType: "crm.appointment.noshow",
        aggregateType: "appointment",
        aggregateId: "apt-1",
        occurredAt: "2026-07-12T09:00:00.000Z",
        payload: {},
      },
      store.insert,
    );
    expect(res.accepted).toBe(true);
    expect(store.calls).toHaveLength(1);
  });
});
