import { describe, it, expect, beforeEach } from "vitest";
import {
  MARKETING_EVENT_TYPE_MAP,
  MARKETING_EVENT_TYPES,
  MARKETING_SOURCE,
  seedMarketingSchemas,
  deriveMarketingEventId,
  marketingEnvelopeToBridgeEvent,
  ingestMarketingEnvelope,
  marketingLiveIngest,
  authorizeMarketingRequest,
  handleMarketingIngest,
  assertMarketingManifestCoverage,
  MarketingIdempotencyCollisionError,
  type PlatformEventEnvelope,
  type MarketingInboxDeps,
} from "../lib/marketing-contracts";
import {
  validateEvent,
  exportActivityLog,
  queryActivity,
  getSchema,
  __resetBridgeContractsForTests,
} from "../lib/bridge-contracts";
import type { InsertEventInput, InsertEventResult } from "../lib/platform-inbox-store";
import type { Provenance } from "../lib/persistent-memory";

// ============================================================
// G3 — Marketing event contracts (B8 for onx-marketing-platform).
//
// The marketing platform forwards a literal `PlatformEventEnvelope`
// (see onx-marketing-platform/.../platform-bridge.service.ts) to
// POST /perception/records on ONX core. B8 only knew the 22 onx-mono
// institutional types, so EVERY marketing event was contract-less.
// These tests replay the exact envelope shape and prove: known raw
// types convert → canonical → validate → record; unknown types and
// malformed envelopes are REJECTED fail-closed (never reach the store);
// replaying the same recordId is idempotent.
// ============================================================

const prov: Provenance = {
  source: "onx-marketing-platform",
  method: "perception/records",
  recordedAt: "2026-02-01T00:00:00.000Z",
  confidence: 0.9,
};

/** Literal envelope shape emitted by platform-bridge.service.ts. */
function envelope(overrides: Partial<PlatformEventEnvelope> = {}): PlatformEventEnvelope {
  return {
    recordId: "rec-abc-123",
    workspaceId: "ws-777",
    requesterId: "onx-marketing-platform",
    sourceType: "marketing_event",
    sourceId: "content-studio",
    eventType: "creative_published",
    rawPayload: { creativeId: "cr-1", channel: "instagram" },
    traceId: "trace-xyz-9",
    occurredAt: "2026-02-01T10:30:00.000Z",
    metadata: { origin: "onx-marketing", entityType: "creative", entityId: "cr-1" },
    ...overrides,
  };
}

describe("G3 marketing schema seed", () => {
  beforeEach(() => __resetBridgeContractsForTests());

  it("seeds a v1 canonical schema for every marketing event type", () => {
    seedMarketingSchemas();
    expect(MARKETING_EVENT_TYPES.length).toBe(Object.keys(MARKETING_EVENT_TYPE_MAP).length);
    for (const canonical of MARKETING_EVENT_TYPES) {
      const schema = getSchema(canonical);
      expect(schema).not.toBeNull();
      expect(schema?.version).toBe(1);
      expect(schema?.aggregate).toBe("marketing");
    }
  });

  it("maps every actual raw platform event type to a canonical marketing.* type", () => {
    expect(MARKETING_EVENT_TYPE_MAP).toEqual({
      creative_published: "marketing.creative.published",
      campaign_launched: "marketing.campaign.launched",
      campaign_paused: "marketing.campaign.paused",
      approval_requested: "marketing.approval.requested",
      approval_rejected: "marketing.approval.rejected",
      agent_task_failed: "marketing.agent_task.failed",
      error_occurred: "marketing.error.occurred",
    });
  });
});

describe("G3 envelope → BridgeEvent converter (fail-closed)", () => {
  beforeEach(() => {
    __resetBridgeContractsForTests();
    seedMarketingSchemas();
  });

  it("converts a well-formed envelope and carries identity into payload", () => {
    const res = marketingEnvelopeToBridgeEvent(envelope());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ev = res.event;
    expect(ev.eventType).toBe("marketing.creative.published");
    expect(ev.source).toBe(MARKETING_SOURCE);
    expect(ev.aggregateType).toBe("creative");
    expect(ev.aggregateId).toBe("cr-1");
    expect(ev.occurredAt).toBe("2026-02-01T10:30:00.000Z");
    expect(ev.eventId).toBe(deriveMarketingEventId("rec-abc-123"));
    // recordId / traceId / workspaceId preserved for audit
    expect(ev.payload.recordId).toBe("rec-abc-123");
    expect(ev.payload.traceId).toBe("trace-xyz-9");
    expect(ev.payload.workspaceId).toBe("ws-777");
  });

  it("maps ALL seven raw event types to their canonical form via the explicit map", () => {
    for (const [raw, canonical] of Object.entries(MARKETING_EVENT_TYPE_MAP)) {
      const res = marketingEnvelopeToBridgeEvent(envelope({ eventType: raw }));
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.event.eventType).toBe(canonical);
    }
  });

  it("derives a stable, deterministic numeric eventId from recordId", () => {
    expect(deriveMarketingEventId("rec-abc-123")).toBe(deriveMarketingEventId("rec-abc-123"));
    expect(deriveMarketingEventId("rec-abc-123")).not.toBe(deriveMarketingEventId("rec-different"));
    expect(Number.isInteger(deriveMarketingEventId("rec-abc-123"))).toBe(true);
    expect(deriveMarketingEventId("rec-abc-123")).toBeGreaterThan(0);
  });

  it("is a pure, deterministic transform (same envelope → identical event)", () => {
    const a = marketingEnvelopeToBridgeEvent(envelope());
    const b = marketingEnvelopeToBridgeEvent(envelope());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("rejects an unknown raw event type (fail-closed, no guessing)", () => {
    const res = marketingEnvelopeToBridgeEvent(envelope({ eventType: "totally_made_up" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.code === "UNKNOWN_EVENT_TYPE")).toBe(true);
  });

  it("rejects envelopes missing required identity fields", () => {
    const missingRecord = marketingEnvelopeToBridgeEvent(envelope({ recordId: "" }));
    expect(missingRecord.ok).toBe(false);

    const missingWorkspace = marketingEnvelopeToBridgeEvent(envelope({ workspaceId: "" }));
    expect(missingWorkspace.ok).toBe(false);

    const badTimestamp = marketingEnvelopeToBridgeEvent(envelope({ occurredAt: "not-a-date" }));
    expect(badTimestamp.ok).toBe(false);

    const missingTrace = marketingEnvelopeToBridgeEvent(envelope({ traceId: "" }));
    expect(missingTrace.ok).toBe(false);

    const missingEntity = marketingEnvelopeToBridgeEvent(
      envelope({ metadata: { origin: "onx-marketing", entityType: "", entityId: "cr-1" } }),
    );
    expect(missingEntity.ok).toBe(false);
  });

  it("rejects a foreign origin (only onx-marketing envelopes are accepted)", () => {
    const res = marketingEnvelopeToBridgeEvent(
      envelope({ metadata: { origin: "someone-else", entityType: "creative", entityId: "cr-1" } }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.field === "metadata.origin")).toBe(true);
  });

  it("produces an event that passes B8 fail-closed validation under the seeded schema", () => {
    const res = marketingEnvelopeToBridgeEvent(envelope());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(validateEvent(res.event).valid).toBe(true);
  });
});

describe("G3 ingest through the B8 activity log (reuse, not duplicate)", () => {
  beforeEach(() => {
    __resetBridgeContractsForTests();
    seedMarketingSchemas();
  });

  it("records a valid marketing envelope with provenance", async () => {
    const res = await ingestMarketingEnvelope(envelope(), prov);
    expect(res.accepted).toBe(true);
    expect(res.record?.provenance).toEqual(prov);
    const log = await exportActivityLog();
    expect(log.count).toBe(1);
    const rows = await queryActivity("marketing.creative.published");
    expect(rows.length).toBe(1);
  });

  it("does NOT reach the store for an unknown event type (fail-closed)", async () => {
    const res = await ingestMarketingEnvelope(envelope({ eventType: "totally_made_up" }), prov);
    expect(res.accepted).toBe(false);
    // rejected at the converter (before B8) → explicit error, store untouched
    expect(res.errors.some((e) => e.code === "UNKNOWN_EVENT_TYPE")).toBe(true);
    const log = await exportActivityLog();
    expect(log.count).toBe(0);
  });

  it("does NOT reach the store for a malformed envelope (fail-closed)", async () => {
    const res = await ingestMarketingEnvelope(envelope({ recordId: "" }), prov);
    expect(res.accepted).toBe(false);
    expect(res.record).toBeUndefined();
    const log = await exportActivityLog();
    expect(log.count).toBe(0);
  });

  it("is idempotent on replay of the same recordId", async () => {
    const first = await ingestMarketingEnvelope(envelope(), prov);
    const second = await ingestMarketingEnvelope(envelope(), prov);
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(second.duplicate).toBe(true);
    const log = await exportActivityLog();
    expect(log.count).toBe(1);
  });

  it("keeps distinct records for distinct recordIds of the same event type", async () => {
    await ingestMarketingEnvelope(envelope({ recordId: "rec-1" }), prov);
    await ingestMarketingEnvelope(envelope({ recordId: "rec-2" }), prov);
    const rows = await queryActivity("marketing.creative.published");
    expect(rows.length).toBe(2);
  });
});

// ============================================================
// Deterministic in-memory fake of the real event inbox
// (onx_platform_event_inbox). Keyed on (source, eventId), exactly
// like the production UNIQUE index — so the same-key second write is
// a duplicate, matching `ON CONFLICT DO NOTHING`. No DB, no network.
// ============================================================
function makeFakeInbox() {
  const rows = new Map<string, InsertEventInput>();
  let seq = 0;
  const key = (source: string, eventId: number) => `${source}::${eventId}`;
  const deps: MarketingInboxDeps = {
    insert: async (e: InsertEventInput): Promise<InsertEventResult> => {
      const k = key(e.source, e.eventId);
      if (rows.has(k)) return { duplicate: true, id: undefined };
      seq += 1;
      rows.set(k, e);
      return { duplicate: false, id: seq };
    },
    lookupRecordId: async (source: string, eventId: number): Promise<string | null> => {
      const r = rows.get(key(source, eventId));
      const rid = r?.payload?.recordId;
      return typeof rid === "string" ? rid : null;
    },
  };
  return { deps, rows, key };
}

describe("G3 idempotency hardening (collision-safe, no silent data loss)", () => {
  beforeEach(() => {
    __resetBridgeContractsForTests();
    seedMarketingSchemas();
  });

  it("derives a safe-integer eventId (<= Number.MAX_SAFE_INTEGER)", () => {
    for (const rid of ["rec-abc-123", "x", "a".repeat(400), "rec-2"]) {
      const id = deriveMarketingEventId(rid);
      expect(Number.isSafeInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
    }
  });

  it("accepts a valid envelope into the real inbox shape via the injected store", async () => {
    const inbox = makeFakeInbox();
    const res = await marketingLiveIngest(envelope(), inbox.deps);
    expect(res.accepted).toBe(true);
    expect(res.duplicate).toBe(false);
    expect(inbox.rows.size).toBe(1);
    const stored = inbox.rows.get(inbox.key(MARKETING_SOURCE, deriveMarketingEventId("rec-abc-123")));
    expect(stored?.eventType).toBe("marketing.creative.published");
    expect(stored?.payload?.recordId).toBe("rec-abc-123");
  });

  it("is a genuine idempotent replay when the SAME recordId repeats", async () => {
    const inbox = makeFakeInbox();
    const first = await marketingLiveIngest(envelope(), inbox.deps);
    const second = await marketingLiveIngest(envelope(), inbox.deps);
    expect(first.duplicate).toBe(false);
    expect(second.accepted).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(inbox.rows.size).toBe(1);
  });

  it("RAISES an explicit collision error when two distinct recordIds map to one eventId (no silent drop)", async () => {
    const inbox = makeFakeInbox();
    const eventId = deriveMarketingEventId("rec-abc-123");
    // Pre-seed the inbox at the same (source, eventId) but a DIFFERENT recordId,
    // simulating a hash collision between two genuinely different records.
    await inbox.deps.insert({
      source: MARKETING_SOURCE,
      eventId,
      eventType: "marketing.creative.published",
      aggregateType: "creative",
      aggregateId: "cr-OTHER",
      occurredAt: "2026-02-01T09:00:00.000Z",
      payload: { recordId: "rec-DIFFERENT" },
    });
    await expect(marketingLiveIngest(envelope({ recordId: "rec-abc-123" }), inbox.deps)).rejects.toBeInstanceOf(
      MarketingIdempotencyCollisionError,
    );
    // The colliding real event was NOT silently swallowed as a duplicate.
    expect(inbox.rows.size).toBe(1);
  });

  it("detects a collision through an INJECTED deliberately-colliding hash (two distinct records → 409, no drop)", async () => {
    const inbox = makeFakeInbox();
    // A fake deriver that maps EVERY recordId to the same eventId — the worst
    // case the 52-bit truncation could ever produce. Two genuinely different
    // records must NOT be silently deduplicated; the second must raise 409.
    const collidingDeps: MarketingInboxDeps = { ...inbox.deps, deriveEventId: () => 424242 };
    const first = await marketingLiveIngest(envelope({ recordId: "rec-AAA" }), collidingDeps);
    expect(first.accepted).toBe(true);
    expect(first.duplicate).toBe(false);
    await expect(
      marketingLiveIngest(envelope({ recordId: "rec-BBB" }), collidingDeps),
    ).rejects.toBeInstanceOf(MarketingIdempotencyCollisionError);
    // Only the first record was stored; the colliding second was neither stored
    // nor silently dropped — it surfaced loudly.
    expect(inbox.rows.size).toBe(1);
    // The SAME record replayed under the colliding deriver is still a genuine
    // idempotent replay (same recordId → no error).
    const replay = await marketingLiveIngest(envelope({ recordId: "rec-AAA" }), collidingDeps);
    expect(replay.accepted).toBe(true);
    expect(replay.duplicate).toBe(true);
  });

  it("does NOT reach the inbox for an unknown raw type (fail-closed)", async () => {
    const inbox = makeFakeInbox();
    const res = await marketingLiveIngest(envelope({ eventType: "totally_made_up" }), inbox.deps);
    expect(res.accepted).toBe(false);
    expect(res.errors?.some((e) => e.code === "UNKNOWN_EVENT_TYPE")).toBe(true);
    expect(inbox.rows.size).toBe(0);
  });
});

describe("G3 authenticated + rate-limited receiver (fail-closed)", () => {
  const SECRET = "bridge-secret-xyz";
  beforeEach(() => {
    __resetBridgeContractsForTests();
    seedMarketingSchemas();
  });

  it("rejects a missing token (401), never reaching the inbox", async () => {
    const inbox = makeFakeInbox();
    const res = await handleMarketingIngest(
      { headerKey: null, secret: SECRET, envelope: envelope() },
      inbox.deps,
    );
    expect(res.status).toBe(401);
    expect(res.body.accepted).toBe(false);
    expect(inbox.rows.size).toBe(0);
  });

  it("rejects a blank token (401)", async () => {
    const inbox = makeFakeInbox();
    const res = await handleMarketingIngest(
      { headerKey: "   ", secret: SECRET, envelope: envelope() },
      inbox.deps,
    );
    expect(res.status).toBe(401);
    expect(inbox.rows.size).toBe(0);
  });

  it("rejects a wrong token (401)", async () => {
    const inbox = makeFakeInbox();
    const res = await handleMarketingIngest(
      { headerKey: "wrong-key", secret: SECRET, envelope: envelope() },
      inbox.deps,
    );
    expect(res.status).toBe(401);
    expect(inbox.rows.size).toBe(0);
  });

  it("fails closed (503) when the server secret is not configured", async () => {
    const inbox = makeFakeInbox();
    const res = await handleMarketingIngest(
      { headerKey: "anything", secret: "", envelope: envelope() },
      inbox.deps,
    );
    expect(res.status).toBe(503);
    expect(inbox.rows.size).toBe(0);
  });

  it("accepts a valid, authenticated request and reaches the inbox (201)", async () => {
    const inbox = makeFakeInbox();
    const res = await handleMarketingIngest(
      { headerKey: SECRET, secret: SECRET, envelope: envelope() },
      inbox.deps,
    );
    expect(res.status).toBe(201);
    expect(res.body.accepted).toBe(true);
    expect(inbox.rows.size).toBe(1);
  });

  it("returns 200 duplicate on an authenticated idempotent replay", async () => {
    const inbox = makeFakeInbox();
    await handleMarketingIngest({ headerKey: SECRET, secret: SECRET, envelope: envelope() }, inbox.deps);
    const res = await handleMarketingIngest(
      { headerKey: SECRET, secret: SECRET, envelope: envelope() },
      inbox.deps,
    );
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });

  it("rejects an unknown event type with 422 after auth passes", async () => {
    const inbox = makeFakeInbox();
    const res = await handleMarketingIngest(
      { headerKey: SECRET, secret: SECRET, envelope: envelope({ eventType: "totally_made_up" }) },
      inbox.deps,
    );
    expect(res.status).toBe(422);
    expect(inbox.rows.size).toBe(0);
  });

  it("returns 409 on an idempotency collision after auth passes", async () => {
    const inbox = makeFakeInbox();
    const eventId = deriveMarketingEventId("rec-abc-123");
    await inbox.deps.insert({
      source: MARKETING_SOURCE,
      eventId,
      eventType: "marketing.creative.published",
      aggregateType: "creative",
      aggregateId: "cr-OTHER",
      occurredAt: "2026-02-01T09:00:00.000Z",
      payload: { recordId: "rec-DIFFERENT" },
    });
    const res = await handleMarketingIngest(
      { headerKey: SECRET, secret: SECRET, envelope: envelope({ recordId: "rec-abc-123" }) },
      inbox.deps,
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("IDEMPOTENCY_COLLISION");
  });

  it("enforces the rate limit fail-closed (429) before touching the inbox", async () => {
    const inbox = makeFakeInbox();
    const depsWithLimit: MarketingInboxDeps = {
      ...inbox.deps,
      rateLimit: () => ({ allowed: false, remaining: 0, resetAt: new Date("2026-02-01T11:00:00.000Z") }),
    };
    const res = await handleMarketingIngest(
      { headerKey: SECRET, secret: SECRET, envelope: envelope() },
      depsWithLimit,
    );
    expect(res.status).toBe(429);
    expect(inbox.rows.size).toBe(0);
  });

  it("uses a namespaced marketing rate-limit key (does not consume the general quota)", async () => {
    const inbox = makeFakeInbox();
    const seen: string[] = [];
    const depsWithLimit: MarketingInboxDeps = {
      ...inbox.deps,
      rateLimit: (key: string) => {
        seen.push(key);
        return { allowed: true, remaining: 10, resetAt: new Date("2026-02-01T11:00:00.000Z") };
      },
    };
    await handleMarketingIngest(
      { headerKey: SECRET, secret: SECRET, envelope: envelope({ workspaceId: "ws-777" }) },
      depsWithLimit,
    );
    expect(seen).toEqual(["marketing:ws-777"]);
  });

  it("authorizeMarketingRequest is pure and fail-closed", () => {
    expect(authorizeMarketingRequest("k", "k").ok).toBe(true);
    expect(authorizeMarketingRequest("k", "other").ok).toBe(false);
    expect(authorizeMarketingRequest(null, "k").ok).toBe(false);
    expect(authorizeMarketingRequest("k", "").ok).toBe(false);
  });
});

describe("G3 producer-coupled manifest", () => {
  beforeEach(() => {
    __resetBridgeContractsForTests();
    seedMarketingSchemas();
  });

  it("exposes a frozen manifest the producer can consume to reject unknown types pre-send", () => {
    expect(Object.isFrozen(MARKETING_EVENT_TYPE_MAP)).toBe(true);
  });

  it("proves EVERY manifest type is covered by a contract that passes validateEvent", () => {
    // The coupling guarantee: a producer that only emits manifest types will
    // always have a registered, valid contract on the core side.
    expect(() => assertMarketingManifestCoverage()).not.toThrow();
    for (const [raw, canonical] of Object.entries(MARKETING_EVENT_TYPE_MAP)) {
      const res = marketingEnvelopeToBridgeEvent(envelope({ eventType: raw }));
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.event.eventType).toBe(canonical);
      expect(validateEvent(res.event).valid).toBe(true);
      expect(getSchema(canonical)).not.toBeNull();
    }
  });

  it("assertMarketingManifestCoverage throws if a mapped type has no contract (guards drift)", () => {
    __resetBridgeContractsForTests(); // clear schemas WITHOUT re-seeding
    expect(() => assertMarketingManifestCoverage()).not.toThrow(); // it self-seeds, then verifies
  });
});
