// ============================================================
// BRIDGE CONTRACTS — B8: unified cross-platform event contracts
//
// A versioned schema registry for the institutional events that cross
// the Platform → Intelligence bridge, plus a unified activity log with
// provenance. Every institutional event type carries an explicit,
// versioned schema; validation is FULL and FAIL-CLOSED — an unknown
// type, an unknown version, a missing required field, or a wrong field
// type is REJECTED (never silently accepted).
//
// Reuse, not duplication:
//   • The activity log is stored through the B4 MemoryStore
//     (api/lib/persistent-memory.ts) — provenance validation, export,
//     and audit come for free from that runtime.
//   • Perception linkage reuses the pure `toPerceptionObject` transform
//     from the perception adapter — the bridge validates + logs the
//     event, then hands the exact same PERCEPTION object to the graph.
//
// Honest naming: this is a contract registry + activity ledger, not a
// mind. No live values are fabricated; confidence comes from the caller.
// ============================================================

import { getBridgeState } from "../bridge-guard";
import {
  InMemoryMemoryStore,
  type MemoryStore,
  type MemoryRecord,
  type MemoryExport,
  type Provenance,
} from "./persistent-memory";
import { toPerceptionObject, type PerceptionIngestInput } from "./perception-adapter";
import type { PerceptionSourceRow } from "./platform-inbox-store";

// ── Types ──────────────────────────────────────────────────────────
export type FieldType = "string" | "number" | "boolean" | "timestamp" | "object";

export interface FieldSpec {
  type: FieldType;
  required: boolean;
}

export interface EventSchema {
  /** Canonical institutional event type, e.g. "pharmacy.dispense.created". */
  eventType: string;
  /** Integer schema version, ≥ 1. Multiple versions coexist. */
  version: number;
  /** Institutional domain, e.g. "pharmacy" (the first dotted segment). */
  aggregate: string;
  /** Declared fields; dotted keys address payload fields, e.g. "payload.itemCount". */
  fields: Record<string, FieldSpec>;
  deprecated?: boolean;
}

export interface BridgeEvent {
  eventType: string;
  /** Target schema version. Omit to validate against the latest version. */
  version?: number;
  source: string;
  eventId: number;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  eventType: string;
  version: number | null;
  errors: ValidationError[];
}

export interface RecordActivityInput {
  event: BridgeEvent;
  provenance: Provenance;
}

export interface RecordActivityResult {
  accepted: boolean;
  validation: ValidationResult;
  record?: MemoryRecord;
  duplicate?: boolean;
}

export interface IngestThroughContractResult {
  accepted: boolean;
  validation: ValidationResult;
  perception?: PerceptionIngestInput;
  record?: MemoryRecord;
}

/** Raised for malformed registry operations — fail-closed. */
export class BridgeContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "BridgeContractError";
    this.code = code;
  }
}

const VALID_FIELD_TYPES: ReadonlySet<FieldType> = new Set([
  "string",
  "number",
  "boolean",
  "timestamp",
  "object",
]);

// ── Registry state ─────────────────────────────────────────────────
const schemas = new Map<string, Map<number, EventSchema>>();
let store: MemoryStore = new InMemoryMemoryStore();
let rejectedCount = 0;

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BridgeContractError("BAD_SCHEMA", `الحقل «${field}» مطلوب.`);
  }
  return value;
}

function validateFieldSpecs(fields: Record<string, FieldSpec>): void {
  if (!fields || typeof fields !== "object") {
    throw new BridgeContractError("BAD_SCHEMA", "fields يجب أن يكون كائناً.");
  }
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    throw new BridgeContractError("BAD_SCHEMA", "المخطط يتطلب حقلاً واحداً على الأقل.");
  }
  for (const key of keys) {
    const spec = fields[key];
    if (!spec || typeof spec !== "object" || !VALID_FIELD_TYPES.has(spec.type)) {
      throw new BridgeContractError("BAD_SCHEMA", `نوع الحقل «${key}» غير صالح.`);
    }
    if (typeof spec.required !== "boolean") {
      throw new BridgeContractError("BAD_SCHEMA", `الحقل «${key}» يحتاج required منطقياً.`);
    }
  }
}

/**
 * Register (or idempotently re-register) a versioned schema. Fail-closed
 * on malformed input; a conflicting redefinition of an existing version
 * is REJECTED (contracts are immutable once published).
 */
export function registerSchema(schema: EventSchema): EventSchema {
  requireNonEmpty(schema?.eventType, "eventType");
  requireNonEmpty(schema?.aggregate, "aggregate");
  if (!Number.isInteger(schema?.version) || schema.version < 1) {
    throw new BridgeContractError("BAD_SCHEMA", "version يجب أن يكون عدداً صحيحاً ≥ 1.");
  }
  validateFieldSpecs(schema.fields);

  const frozen: EventSchema = {
    eventType: schema.eventType,
    version: schema.version,
    aggregate: schema.aggregate,
    fields: { ...schema.fields },
    deprecated: schema.deprecated === true,
  };

  let versions = schemas.get(frozen.eventType);
  if (versions?.has(frozen.version)) {
    const existing = versions.get(frozen.version)!;
    if (JSON.stringify(existing) !== JSON.stringify(frozen)) {
      throw new BridgeContractError(
        "VERSION_CONFLICT",
        `النسخة ${frozen.version} من «${frozen.eventType}» مُعرّفة مسبقاً باختلاف؛ العقود غير قابلة للتعديل.`,
      );
    }
    return { ...existing, fields: { ...existing.fields } };
  }
  if (!versions) {
    versions = new Map<number, EventSchema>();
    schemas.set(frozen.eventType, versions);
  }
  versions.set(frozen.version, frozen);
  return { ...frozen, fields: { ...frozen.fields } };
}

export function getSchema(eventType: string, version?: number): EventSchema | null {
  const versions = schemas.get(eventType);
  if (!versions || versions.size === 0) return null;
  const target = version ?? latestVersion(eventType);
  if (target == null) return null;
  const schema = versions.get(target);
  return schema ? { ...schema, fields: { ...schema.fields } } : null;
}

export function latestVersion(eventType: string): number | null {
  const versions = schemas.get(eventType);
  if (!versions || versions.size === 0) return null;
  return Math.max(...versions.keys());
}

export function listVersions(eventType: string): number[] {
  const versions = schemas.get(eventType);
  if (!versions) return [];
  return [...versions.keys()].sort((a, b) => a - b);
}

export function listEventTypes(): string[] {
  return [...schemas.keys()].sort();
}

// ── Validation (fail-closed) ───────────────────────────────────────
function resolvePath(event: BridgeEvent, path: string): unknown {
  if (path.startsWith("payload.")) {
    const key = path.slice("payload.".length);
    return event.payload?.[key];
  }
  return (event as unknown as Record<string, unknown>)[path];
}

function typeMatches(value: unknown, type: FieldType): boolean {
  switch (type) {
    case "string":
      return typeof value === "string" && value.length > 0;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "timestamp":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

/**
 * Validate an event against its registered schema. FAIL-CLOSED: unknown
 * event type or version, a missing required field, or a type mismatch
 * all produce `valid:false` with explicit errors.
 */
export function validateEvent(event: BridgeEvent): ValidationResult {
  const eventType = event?.eventType ?? "";
  const versions = schemas.get(eventType);
  if (!versions || versions.size === 0) {
    return {
      valid: false,
      eventType,
      version: null,
      errors: [{ field: "eventType", code: "UNKNOWN_EVENT_TYPE", message: `لا عقد مسجّل لـ«${eventType}».` }],
    };
  }
  const version = event.version ?? latestVersion(eventType);
  const schema = version != null ? versions.get(version) : undefined;
  if (!schema) {
    return {
      valid: false,
      eventType,
      version: event.version ?? null,
      errors: [{ field: "version", code: "UNKNOWN_VERSION", message: `النسخة ${event.version} غير مسجّلة.` }],
    };
  }

  const errors: ValidationError[] = [];
  for (const [field, spec] of Object.entries(schema.fields)) {
    const value = resolvePath(event, field);
    const missing = value === undefined || value === null;
    if (missing) {
      if (spec.required) {
        errors.push({ field, code: "MISSING_FIELD", message: `الحقل «${field}» مطلوب.` });
      }
      continue;
    }
    if (!typeMatches(value, spec.type)) {
      errors.push({ field, code: "TYPE_MISMATCH", message: `الحقل «${field}» يجب أن يكون ${spec.type}.` });
    }
  }

  return { valid: errors.length === 0, eventType, version: schema.version, errors };
}

// ── Unified activity log (reuses B4 MemoryStore) ───────────────────
function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function activityId(event: BridgeEvent, version: number): string {
  return `act-${sanitizeIdPart(event.source)}-${sanitizeIdPart(event.eventType)}-v${version}-${event.eventId}`;
}

function activityKind(eventType: string): string {
  return `bridge:${eventType}`;
}

/**
 * Validate then durably record a cross-bridge event with provenance.
 * FAIL-CLOSED: invalid events are NOT recorded (only counted). Replaying
 * the same occurrence is idempotent (stable id via the MemoryStore).
 */
export async function recordActivity(input: RecordActivityInput): Promise<RecordActivityResult> {
  const validation = validateEvent(input.event);
  if (!validation.valid) {
    rejectedCount += 1;
    return { accepted: false, validation };
  }
  const version = validation.version!;
  const id = activityId(input.event, version);
  const content = `${input.event.eventType} v${version} ${input.event.aggregateType}#${input.event.aggregateId}`;
  const existing = await store.get(id, true);
  if (existing) {
    return { accepted: true, validation, record: existing, duplicate: true };
  }
  const record = await store.put({
    id,
    kind: activityKind(input.event.eventType),
    content,
    provenance: input.provenance,
  });
  return { accepted: true, validation, record };
}

/** Audit query: all recorded activity for one event type, oldest first. */
export async function queryActivity(eventType: string): Promise<MemoryRecord[]> {
  return store.list(activityKind(eventType));
}

/** Full audit export of the activity log. */
export function exportActivityLog(): Promise<MemoryExport> {
  return store.export();
}

export interface BridgeContractStatus {
  bridge: "bridgeContracts";
  eventTypeCount: number;
  schemaCount: number;
  activityCount: number;
  rejectedCount: number;
  enabled: boolean;
  hasSharedSecret: boolean;
}

export async function getBridgeContractStatus(): Promise<BridgeContractStatus> {
  const exported = await store.export();
  let schemaCount = 0;
  for (const versions of schemas.values()) schemaCount += versions.size;
  return {
    bridge: "bridgeContracts",
    eventTypeCount: schemas.size,
    schemaCount,
    activityCount: exported.count,
    rejectedCount,
    ...getBridgeState(),
  };
}

// ── Perception-adapter linkage (reuse, not duplicate) ──────────────
function rowToEvent(row: PerceptionSourceRow): BridgeEvent {
  const payload: Record<string, unknown> = {};
  for (const key of row.payloadKeys ?? []) payload[key] = true;
  return {
    eventType: row.eventType,
    source: row.source,
    eventId: row.eventId,
    aggregateType: row.aggregateType ?? "",
    aggregateId: row.aggregateId ?? "",
    occurredAt: row.occurredAt ?? row.receivedAt ?? "",
    payload,
  };
}

/**
 * Contract-checked perception ingest: validate + log the inbox event,
 * and only then produce the PERCEPTION object via the adapter's own pure
 * transform. FAIL-CLOSED: an event with no valid contract yields no
 * perception object.
 */
export async function ingestThroughContract(
  row: PerceptionSourceRow,
  provenance: Provenance,
): Promise<IngestThroughContractResult> {
  const outcome = await recordActivity({ event: rowToEvent(row), provenance });
  if (!outcome.accepted) {
    return { accepted: false, validation: outcome.validation };
  }
  return {
    accepted: true,
    validation: outcome.validation,
    perception: toPerceptionObject(row),
    record: outcome.record,
  };
}

// ── Institutional seed ─────────────────────────────────────────────
/** Canonical institutional events forwarded across the bridge. */
export const INSTITUTIONAL_EVENT_TYPES: readonly string[] = [
  "pharmacy.dispense.created",
  "procurement.grn.created",
  "procurement.po.created",
  "hr.attendance.recorded",
  "billing.invoice.created",
  "billing.invoice.overdue",
  "insurance.claim.created",
  "insurance.claim.approved",
  "insurance.claim.paid",
  "payroll.run.created",
  "payroll.run.submitted",
  "payroll.run.approved",
  "payroll.run.paid",
  "clinic.appointment.completed",
  "inventory.movement.created",
  "finance.payment.received",
  "lab.result.created",
  "crm.appointment.booked",
  "crm.appointment.completed",
  "crm.appointment.noshow",
  "crm.loyalty.awarded",
  "ops.monitor.alert",
];

/** Shared v1 identity contract carried by every institutional event. */
const BASE_INSTITUTIONAL_FIELDS: Record<string, FieldSpec> = {
  eventId: { type: "number", required: true },
  aggregateType: { type: "string", required: true },
  aggregateId: { type: "string", required: true },
  occurredAt: { type: "timestamp", required: true },
};

/** Register the v1 institutional identity contract for every known type. */
export function seedInstitutionalSchemas(): void {
  for (const eventType of INSTITUTIONAL_EVENT_TYPES) {
    registerSchema({
      eventType,
      version: 1,
      aggregate: eventType.split(".")[0],
      fields: { ...BASE_INSTITUTIONAL_FIELDS },
    });
  }
}

// Test-only: clear the registry, activity store, and counters.
export function __resetBridgeContractsForTests(): void {
  schemas.clear();
  store = new InMemoryMemoryStore();
  rejectedCount = 0;
}
