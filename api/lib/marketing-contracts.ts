// ============================================================
// MARKETING EVENT CONTRACTS — G3: B8 contracts for the marketing bridge
//
// onx-marketing-platform forwards a literal `PlatformEventEnvelope`
// (platform-bridge.service.ts) to POST /perception/records on ONX core.
// B8 (bridge-contracts.ts) only carried the 22 onx-mono institutional
// types, so every marketing event crossed the bridge WITHOUT a contract.
// This module closes that gap by REUSING the B8 registry — it does not
// re-implement validation, storage, or the activity log:
//   • seedMarketingSchemas()  → registerSchema (B8) for each canonical type
//   • marketingEnvelopeToBridgeEvent() → explicit, fail-closed raw→canonical
//     mapping; an unknown raw type or a malformed envelope is REJECTED
//     (never guessed, never silently coerced).
//   • ingestMarketingEnvelope() → recordActivity (B8) with provenance; an
//     invalid event never reaches the MemoryStore (fail-closed).
//
// Determinism: the numeric B8 `eventId` is derived from the envelope's
// string `recordId` via a stable 32-bit FNV-1a hash, so replaying the same
// record is idempotent (same id → same activity id in the B8 store).
//
// Honest naming: this is a contract adapter, not a mind. No live values.
// ============================================================

import {
  registerSchema,
  validateEvent,
  recordActivity,
  type BridgeEvent,
  type FieldSpec,
  type ValidationError,
  type RecordActivityResult,
} from "./bridge-contracts";
import type { Provenance } from "./persistent-memory";

// ── The literal envelope forwarded by the marketing platform ───────
// Mirrors onx-marketing-platform platform-bridge.service.ts exactly.
export interface PlatformEventEnvelope {
  recordId: string;
  workspaceId: string;
  requesterId: string;
  sourceType: string;
  sourceId: string;
  eventType: string;
  rawPayload: Record<string, unknown>;
  traceId: string;
  occurredAt: string;
  metadata: {
    origin: string;
    entityType: string;
    entityId: string;
  };
}

/** Bridge `source` tag for every marketing-originated activity record. */
export const MARKETING_SOURCE = "onx-marketing-platform";

/** Only envelopes stamped with this origin are accepted (fail-closed). */
export const MARKETING_ORIGIN = "onx-marketing";

/**
 * Explicit raw→canonical map. The raw keys are the ACTUAL event types the
 * marketing platform emits (content-studio + reality events); the values
 * are the canonical `marketing.<aggregate>.<action>` contract names. An
 * event whose raw type is absent here is rejected — never guessed.
 */
export const MARKETING_EVENT_TYPE_MAP: Readonly<Record<string, string>> = {
  creative_published: "marketing.creative.published",
  campaign_launched: "marketing.campaign.launched",
  campaign_paused: "marketing.campaign.paused",
  approval_requested: "marketing.approval.requested",
  approval_rejected: "marketing.approval.rejected",
  agent_task_failed: "marketing.agent_task.failed",
  error_occurred: "marketing.error.occurred",
};

/** Canonical marketing event types (contract names). */
export const MARKETING_EVENT_TYPES: readonly string[] = Object.values(MARKETING_EVENT_TYPE_MAP);

/**
 * v1 identity contract carried by every marketing event. Beyond the shared
 * B8 identity fields, the envelope's audit identifiers (recordId, traceId,
 * workspaceId) are REQUIRED in the payload, so a produced event that drops
 * them fails B8 validation — the converter and the contract stay coupled.
 */
const MARKETING_BASE_FIELDS: Record<string, FieldSpec> = {
  eventId: { type: "number", required: true },
  aggregateType: { type: "string", required: true },
  aggregateId: { type: "string", required: true },
  occurredAt: { type: "timestamp", required: true },
  "payload.recordId": { type: "string", required: true },
  "payload.traceId": { type: "string", required: true },
  "payload.workspaceId": { type: "string", required: true },
};

/** Register the v1 marketing identity contract for every canonical type. */
export function seedMarketingSchemas(): void {
  for (const eventType of MARKETING_EVENT_TYPES) {
    registerSchema({
      eventType,
      version: 1,
      aggregate: "marketing",
      fields: { ...MARKETING_BASE_FIELDS },
    });
  }
}

/**
 * Stable 32-bit FNV-1a hash of the string recordId → positive integer.
 * Deterministic and collision-resistant enough to key the B8 activity id,
 * so replaying the same recordId is idempotent.
 */
export function deriveMarketingEventId(recordId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < recordId.length; i += 1) {
    hash ^= recordId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // >>> 0 → unsigned; +1 so it is always ≥ 1 (never 0).
  return (hash >>> 0) + 1;
}

export type EnvelopeConversion =
  | { ok: true; event: BridgeEvent }
  | { ok: false; errors: ValidationError[] };

export interface MarketingIngestResult {
  accepted: boolean;
  errors: ValidationError[];
  result?: RecordActivityResult;
  record?: RecordActivityResult["record"];
  duplicate?: boolean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Convert the literal marketing envelope into a canonical B8 BridgeEvent.
 * FAIL-CLOSED: an unknown raw event type, a foreign origin, a missing or
 * blank identity field, or a non-ISO timestamp yields `ok:false` with
 * explicit errors and NO event — nothing is guessed or coerced.
 */
export function marketingEnvelopeToBridgeEvent(envelope: PlatformEventEnvelope): EnvelopeConversion {
  const errors: ValidationError[] = [];
  const e = envelope ?? ({} as PlatformEventEnvelope);
  const metadata = e.metadata ?? ({} as PlatformEventEnvelope["metadata"]);

  if (!isNonEmptyString(e.recordId)) {
    errors.push({ field: "recordId", code: "MISSING_FIELD", message: "recordId مطلوب." });
  }
  if (!isNonEmptyString(e.workspaceId)) {
    errors.push({ field: "workspaceId", code: "MISSING_FIELD", message: "workspaceId مطلوب." });
  }
  if (!isNonEmptyString(e.traceId)) {
    errors.push({ field: "traceId", code: "MISSING_FIELD", message: "traceId مطلوب." });
  }
  if (!isNonEmptyString(e.occurredAt) || Number.isNaN(Date.parse(e.occurredAt))) {
    errors.push({ field: "occurredAt", code: "BAD_TIMESTAMP", message: "occurredAt يجب أن يكون ISO صالحاً." });
  }
  if (metadata.origin !== MARKETING_ORIGIN) {
    errors.push({ field: "metadata.origin", code: "FOREIGN_ORIGIN", message: `المصدر يجب أن يكون «${MARKETING_ORIGIN}».` });
  }
  if (!isNonEmptyString(metadata.entityType)) {
    errors.push({ field: "metadata.entityType", code: "MISSING_FIELD", message: "metadata.entityType مطلوب." });
  }
  if (!isNonEmptyString(metadata.entityId)) {
    errors.push({ field: "metadata.entityId", code: "MISSING_FIELD", message: "metadata.entityId مطلوب." });
  }

  const canonical = isNonEmptyString(e.eventType) ? MARKETING_EVENT_TYPE_MAP[e.eventType] : undefined;
  if (!canonical) {
    errors.push({
      field: "eventType",
      code: "UNKNOWN_EVENT_TYPE",
      message: `نوع الحدث «${e.eventType ?? ""}» لا عقد marketing مسجّل له.`,
    });
  }

  if (errors.length > 0 || !canonical) {
    return { ok: false, errors };
  }

  const event: BridgeEvent = {
    eventType: canonical,
    version: 1,
    source: MARKETING_SOURCE,
    eventId: deriveMarketingEventId(e.recordId),
    aggregateType: metadata.entityType,
    aggregateId: metadata.entityId,
    occurredAt: e.occurredAt,
    payload: {
      recordId: e.recordId,
      traceId: e.traceId,
      workspaceId: e.workspaceId,
      sourceId: e.sourceId,
      sourceType: e.sourceType,
      requesterId: e.requesterId,
      origin: metadata.origin,
      entityType: metadata.entityType,
      entityId: metadata.entityId,
      raw: e.rawPayload ?? {},
    },
  };
  return { ok: true, event };
}

/**
 * Convert + durably record a marketing envelope through the B8 activity log
 * with provenance. FAIL-CLOSED: a rejected conversion never reaches the
 * MemoryStore. Replaying the same recordId is idempotent.
 */
export async function ingestMarketingEnvelope(
  envelope: PlatformEventEnvelope,
  provenance: Provenance,
): Promise<MarketingIngestResult> {
  const conversion = marketingEnvelopeToBridgeEvent(envelope);
  if (!conversion.ok) {
    return { accepted: false, errors: conversion.errors };
  }
  const result = await recordActivity({ event: conversion.event, provenance });
  if (!result.accepted) {
    return { accepted: false, errors: result.validation.errors, result };
  }
  return {
    accepted: true,
    errors: [],
    result,
    record: result.record,
    duplicate: result.duplicate,
  };
}

// Re-export the B8 validator so callers can pre-check a produced event
// without importing two modules — pure convenience, same implementation.
export { validateEvent };
