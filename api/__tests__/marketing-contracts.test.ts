import { describe, it, expect, beforeEach } from "vitest";
import {
  MARKETING_EVENT_TYPE_MAP,
  MARKETING_EVENT_TYPES,
  MARKETING_SOURCE,
  seedMarketingSchemas,
  deriveMarketingEventId,
  marketingEnvelopeToBridgeEvent,
  ingestMarketingEnvelope,
  type PlatformEventEnvelope,
} from "../lib/marketing-contracts";
import {
  validateEvent,
  exportActivityLog,
  queryActivity,
  getSchema,
  __resetBridgeContractsForTests,
} from "../lib/bridge-contracts";
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
