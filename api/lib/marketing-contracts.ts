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
  getSchema,
  type BridgeEvent,
  type FieldSpec,
  type ValidationError,
  type RecordActivityResult,
} from "./bridge-contracts";
import type { Provenance } from "./persistent-memory";
import type { InsertEventInput, InsertEventResult } from "./platform-inbox-store";
import { createHash } from "node:crypto";

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
export const MARKETING_EVENT_TYPE_MAP: Readonly<Record<string, string>> = Object.freeze({
  creative_published: "marketing.creative.published",
  campaign_launched: "marketing.campaign.launched",
  campaign_paused: "marketing.campaign.paused",
  approval_requested: "marketing.approval.requested",
  approval_rejected: "marketing.approval.rejected",
  agent_task_failed: "marketing.agent_task.failed",
  error_occurred: "marketing.error.occurred",
});

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
 * Collision-resistant idempotency id for a marketing record.
 *
 * The B8 `eventId` and the platform inbox unique key `(source, eventId)` are
 * numeric, so the string `recordId` is hashed into a positive integer. A weak
 * 32-bit hash has a birthday bound of only ~65k records — two DIFFERENT records
 * could collide and the inbox's `ON CONFLICT DO NOTHING` would silently drop the
 * second (silent data loss). We therefore use SHA-256 (≥128-bit computed) and
 * fold it down to 52 bits so the value stays a safe integer (≤ 2^53−1, fits a
 * Postgres BIGINT) while pushing the birthday bound out to ~2^26 (~67M). A
 * genuine collision is additionally caught explicitly at ingest time
 * (`MarketingIdempotencyCollisionError`) — never a silent duplicate.
 *
 * Deterministic: pure function of `recordId`, no time/randomness/network.
 */
export function deriveMarketingEventId(recordId: string): number {
  const hex = createHash("sha256").update(recordId, "utf8").digest("hex");
  // First 13 hex chars = 52 bits → 0 .. 2^52−1. +1 keeps it strictly positive
  // and ≤ 2^52 < Number.MAX_SAFE_INTEGER.
  return Number.parseInt(hex.slice(0, 13), 16) + 1;
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
export function marketingEnvelopeToBridgeEvent(
  envelope: PlatformEventEnvelope,
  deriveId: (recordId: string) => number = deriveMarketingEventId,
): EnvelopeConversion {
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
    eventId: deriveId(e.recordId),
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

// ============================================================
// LIVE INGEST — reach the SAME event inbox the minds read
//
// The B8 activity log (ingestMarketingEnvelope, above) is an audit ledger.
// For a marketing event to actually inform the minds it must land in the
// real `onx_platform_event_inbox` (the store read by the perception feed).
// `marketingLiveIngest` converges the converted+validated envelope onto that
// inbox through an INJECTED writer (`deps.insert`, defaulting in production to
// the real `insertEvent`), so tests stay deterministic and DB-free while
// production reaches the live store — the same seam #62 established for the
// institutional path (`ingestThroughBridgeContract`).
// ============================================================

/**
 * Injected adapters for the live inbox. `insert` writes to the shared event
 * inbox (keyed on `source,eventId`); `lookupRecordId` reads back the stored
 * `recordId` for a given `(source,eventId)` so a hash collision between two
 * genuinely different records is detected instead of silently deduplicated.
 * `rateLimit` and `now` are optional deterministic hooks.
 */
export interface MarketingInboxDeps {
  insert: (event: InsertEventInput) => Promise<InsertEventResult>;
  lookupRecordId: (source: string, eventId: number) => Promise<string | null>;
  rateLimit?: (key: string) => { allowed: boolean; remaining: number; resetAt: Date };
  now?: () => string;
  /**
   * Optional override for the numeric eventId derivation. Production leaves this
   * unset (uses `deriveMarketingEventId`). Tests inject a deliberately colliding
   * deriver to prove the collision path raises `MarketingIdempotencyCollisionError`.
   */
  deriveEventId?: (recordId: string) => number;
}

/**
 * Raised when two DIFFERENT records hash to the same numeric `eventId`. The
 * inbox would otherwise treat the second as a duplicate and drop it silently;
 * we surface it loudly so no real event is lost.
 */
export class MarketingIdempotencyCollisionError extends Error {
  readonly code = "IDEMPOTENCY_COLLISION";
  readonly eventId: number;
  readonly incomingRecordId: string;
  readonly storedRecordId: string;
  constructor(eventId: number, incomingRecordId: string, storedRecordId: string) {
    super(
      `[IDEMPOTENCY_COLLISION] eventId ${eventId} maps to distinct records: ` +
        `stored="${storedRecordId}" incoming="${incomingRecordId}".`,
    );
    this.name = "MarketingIdempotencyCollisionError";
    this.eventId = eventId;
    this.incomingRecordId = incomingRecordId;
    this.storedRecordId = storedRecordId;
  }
}

export interface MarketingLiveIngestResult {
  accepted: boolean;
  duplicate?: boolean;
  id?: number;
  eventId?: number;
  errors?: ValidationError[];
}

/**
 * Convert (fail-closed) → validate under the seeded B8 contract → write to the
 * real event inbox via `deps.insert`. FAIL-CLOSED: a rejected conversion or an
 * invalid event never reaches the inbox. Idempotent on replay of the SAME
 * recordId; a genuine hash collision (distinct recordId, same eventId) throws
 * `MarketingIdempotencyCollisionError` rather than dropping the event.
 */
export async function marketingLiveIngest(
  envelope: PlatformEventEnvelope,
  deps: MarketingInboxDeps,
): Promise<MarketingLiveIngestResult> {
  const conversion = marketingEnvelopeToBridgeEvent(envelope, deps.deriveEventId);
  if (!conversion.ok) {
    return { accepted: false, errors: conversion.errors };
  }
  // Defense in depth: ensure the contract is registered and re-validate the
  // produced event with the SAME B8 validator used everywhere else.
  seedMarketingSchemas();
  const validation = validateEvent(conversion.event);
  if (!validation.valid) {
    return { accepted: false, errors: validation.errors };
  }

  const ev = conversion.event;
  const insertInput: InsertEventInput = {
    source: ev.source,
    eventId: ev.eventId,
    eventType: ev.eventType,
    aggregateType: ev.aggregateType,
    aggregateId: ev.aggregateId,
    occurredAt: ev.occurredAt,
    payload: ev.payload,
  };

  const result = await deps.insert(insertInput);

  if (result.duplicate) {
    // The unique `(source, eventId)` index rejected this write, so a row for
    // that key is already committed (ON CONFLICT DO NOTHING waits out any
    // concurrent inserter before reporting the conflict). The subsequent
    // read-back therefore returns a stable, committed recordId — no read/write
    // race: a matching recordId is a genuine idempotent replay; a different one
    // is a true hash collision and is raised loudly rather than dropped.
    const incoming = String(ev.payload.recordId ?? "");
    const stored = await deps.lookupRecordId(ev.source, ev.eventId);
    if (stored !== null && stored !== incoming) {
      throw new MarketingIdempotencyCollisionError(ev.eventId, incoming, stored);
    }
    return { accepted: true, duplicate: true, id: result.id, eventId: ev.eventId };
  }

  return { accepted: true, duplicate: false, id: result.id, eventId: ev.eventId };
}

// ============================================================
// AUTHENTICATED RECEIVER — fail-closed transport-agnostic handler
//
// The marketing platform crosses the SAME Platform→Intelligence bridge as the
// institutional path, so it authenticates with the same shared secret
// (`x-onx-bridge-key`). `authorizeMarketingRequest` is a pure fail-closed check
// (missing secret → 503; missing/blank/mismatched key → 401). `handleMarketingIngest`
// composes auth → rate limit → live ingest into an HTTP-shaped result so any
// transport (the tRPC bridge mutation, or a raw Hono route) is a thin adapter.
// ============================================================

export interface MarketingAuthResult {
  ok: boolean;
  code?: "SECRET_NOT_CONFIGURED" | "MISSING_KEY" | "UNAUTHORIZED";
  message?: string;
}

/** Pure, fail-closed auth for a marketing bridge request. */
export function authorizeMarketingRequest(
  providedKey: string | null | undefined,
  expectedSecret: string | null | undefined,
): MarketingAuthResult {
  if (!isNonEmptyString(expectedSecret)) {
    return { ok: false, code: "SECRET_NOT_CONFIGURED", message: "لم يُضبط سر الجسر." };
  }
  if (!isNonEmptyString(providedKey)) {
    return { ok: false, code: "MISSING_KEY", message: "مفتاح المصادقة مفقود." };
  }
  if (providedKey !== expectedSecret) {
    return { ok: false, code: "UNAUTHORIZED", message: "مفتاح المصادقة غير صالح." };
  }
  return { ok: true };
}

export interface MarketingIngestRequest {
  headerKey: string | null | undefined;
  secret: string | null | undefined;
  envelope: PlatformEventEnvelope;
  rateLimitKey?: string;
}

export interface MarketingIngestResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Full fail-closed receiver pipeline: authenticate, rate-limit, then live-ingest
 * into the real inbox. Returns an HTTP-shaped `{status, body}`:
 *  401 missing/blank/wrong key · 503 secret not configured · 429 rate limited ·
 *  422 contract rejected · 409 idempotency collision · 201 created · 200 duplicate.
 */
export async function handleMarketingIngest(
  req: MarketingIngestRequest,
  deps: MarketingInboxDeps,
): Promise<MarketingIngestResponse> {
  const auth = authorizeMarketingRequest(req.headerKey, req.secret);
  if (!auth.ok) {
    const status = auth.code === "SECRET_NOT_CONFIGURED" ? 503 : 401;
    return { status, body: { accepted: false, error: auth.code, message: auth.message } };
  }

  if (deps.rateLimit) {
    // Namespace the marketing bucket so it never consumes the general
    // `ingestEvent`/`consult` quota (separate key space per the gate decision).
    const key = req.rateLimitKey ?? `marketing:${req.envelope?.workspaceId ?? "default"}`;
    const rc = deps.rateLimit(key);
    if (!rc.allowed) {
      return {
        status: 429,
        body: { accepted: false, error: "RATE_LIMIT_EXCEEDED", resetAt: rc.resetAt.toISOString() },
      };
    }
  }

  try {
    const res = await marketingLiveIngest(req.envelope, deps);
    if (!res.accepted) {
      return { status: 422, body: { accepted: false, error: "CONTRACT_REJECTED", errors: res.errors ?? [] } };
    }
    return {
      status: res.duplicate ? 200 : 201,
      body: { accepted: true, duplicate: !!res.duplicate, id: res.id, eventId: res.eventId },
    };
  } catch (error) {
    if (error instanceof MarketingIdempotencyCollisionError) {
      return {
        status: 409,
        body: { accepted: false, error: error.code, eventId: error.eventId },
      };
    }
    throw error;
  }
}

/**
 * Producer coupling guard: assert that EVERY canonical type in the manifest has
 * a registered contract on the core side. The exported, frozen
 * `MARKETING_EVENT_TYPE_MAP` is the single source of truth a producer consumes
 * to reject unknown types before sending; this guard proves the core honours the
 * same manifest (self-seeds, then verifies) so the two never drift.
 */
export function assertMarketingManifestCoverage(): void {
  seedMarketingSchemas();
  for (const [raw, canonical] of Object.entries(MARKETING_EVENT_TYPE_MAP)) {
    if (!getSchema(canonical)) {
      throw new Error(`MANIFEST_UNCOVERED: raw "${raw}" → "${canonical}" has no registered contract.`);
    }
  }
}
