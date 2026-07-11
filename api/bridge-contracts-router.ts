// ============================================================
// BRIDGE CONTRACTS ROUTER — B8 over tRPC
//
// Surfaces the versioned schema registry + unified activity log:
//   • status   — registry counts + bridge access state
//   • schemas  — list institutional event types
//   • schema   — fetch a specific (or latest) schema version
//   • validate — full fail-closed validation of an event
//   • record   — validate + durably log an event with provenance
//   • activity — audit query of the activity log by event type
//
// The registry is seeded with the institutional contracts on module
// load so the surface is immediately usable (deterministic, keyless).
// Follows the capability-factory-router / methods-library-router pattern.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  getBridgeContractStatus,
  getSchema,
  listEventTypes,
  listVersions,
  validateEvent,
  recordActivity,
  queryActivity,
  seedInstitutionalSchemas,
  type BridgeEvent,
} from "./lib/bridge-contracts";

// Seed the canonical institutional contracts once at import time.
seedInstitutionalSchemas();

const zEvent = z.object({
  eventType: z.string().min(1),
  version: z.number().int().positive().optional(),
  source: z.string().min(1),
  eventId: z.number(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  occurredAt: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const zProvenance = z.object({
  source: z.string().min(1),
  method: z.string().min(1),
  recordedAt: z.string().min(1),
  confidence: z.number(),
});

export const bridgeContractsRouter = createRouter({
  // Registry + activity counts alongside the bridge access state.
  status: publicQuery.query(() => getBridgeContractStatus()),

  // All registered institutional event types with their known versions.
  schemas: publicQuery.query(() =>
    listEventTypes().map((eventType) => ({ eventType, versions: listVersions(eventType) })),
  ),

  // Fetch a specific (or latest) schema version — fail-closed on unknown.
  schema: publicQuery
    .input(z.object({ eventType: z.string().min(1), version: z.number().int().positive().optional() }))
    .query(({ input }) => {
      const schema = getSchema(input.eventType, input.version);
      if (!schema) return { found: false as const };
      return { found: true as const, schema };
    }),

  // Full fail-closed validation of an event against its contract.
  validate: publicQuery
    .input(zEvent)
    .query(({ input }) => validateEvent(input as BridgeEvent)),

  // Validate + durably record an event with provenance.
  record: publicQuery
    .input(z.object({ event: zEvent, provenance: zProvenance }))
    .mutation(({ input }) =>
      recordActivity({ event: input.event as BridgeEvent, provenance: input.provenance }),
    ),

  // Audit query of the activity log for one event type.
  activity: publicQuery
    .input(z.object({ eventType: z.string().min(1) }))
    .query(({ input }) => queryActivity(input.eventType)),
});
