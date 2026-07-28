// ============================================================
// Intelligence-object subsystem — PostgreSQL self-provisioning
// (ONX-FRR-2026-001, GAP-001).
//
// The 28 intelligence-object tables were defined only in a MySQL schema that
// never ran against the live PostgreSQL database, so every getDb()-backed
// endpoint returned HTTP 500. This module creates those tables in Postgres on
// boot, idempotently (CREATE TABLE IF NOT EXISTS), matching the self-
// provisioning idiom every other durable pg store in this service uses.
//
// DDL is generated from db/schema.ts via drizzle-kit (dialect postgresql) and
// pasted here verbatim (CREATE ... IF NOT EXISTS). Foreign-key constraints are
// intentionally omitted: intelligence-router joins by id in application code
// and never relies on FK enforcement, so this stays a pure additive, replay-
// safe provisioning step. Regenerate with `npm run db:generate` if the schema
// changes, then refresh the DDL below.
// ============================================================
import { Pool } from "pg";

let pool: Pool | null = null;
let ready = false;

function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL ?? "";
  if (!connectionString.startsWith("postgres")) return null;
  if (!pool) {
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 2,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

const DDL = `
CREATE TABLE IF NOT EXISTS "analytics_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reportId" varchar(36) NOT NULL,
	"type" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"period" varchar(50) NOT NULL,
	"data" text NOT NULL,
	"aiSummary" text,
	"moaFormat" integer DEFAULT 0 NOT NULL,
	"generatedBy" varchar(100),
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_reports_reportId_unique" UNIQUE("reportId")
);
CREATE TABLE IF NOT EXISTS "bi_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"metricId" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" text NOT NULL,
	"value" numeric(15, 4) NOT NULL,
	"unit" varchar(50),
	"period" varchar(50) NOT NULL,
	"target" numeric(15, 4),
	"benchmark" numeric(15, 4),
	"trend" text DEFAULT 'STABLE',
	"aiAnalysis" text,
	"recordedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bi_metrics_metricId_unique" UNIQUE("metricId")
);
CREATE TABLE IF NOT EXISTS "branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"branchId" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"nameAr" varchar(255),
	"type" text DEFAULT 'PILOT' NOT NULL,
	"status" text DEFAULT 'PLANNING' NOT NULL,
	"city" varchar(100),
	"region" varchar(100),
	"country" varchar(100) DEFAULT 'SA',
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"managerName" varchar(255),
	"staffCount" integer DEFAULT 0 NOT NULL,
	"patientsPerDay" integer DEFAULT 0 NOT NULL,
	"revenueTarget" numeric(15, 2),
	"aiHealthScore" numeric(4, 2),
	"launchDate" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "branches_branchId_unique" UNIQUE("branchId")
);
CREATE TABLE IF NOT EXISTS "call_center_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" varchar(36) NOT NULL,
	"customerId" varchar(255),
	"agentId" varchar(255),
	"category" text NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"subject" varchar(255) NOT NULL,
	"description" text,
	"resolution" text,
	"aiFeedback" text,
	"satisfactionScore" numeric(3, 1),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "call_center_tickets_ticketId_unique" UNIQUE("ticketId")
);
CREATE TABLE IF NOT EXISTS "capital_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"objectId" integer NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(12, 4) NOT NULL,
	"operation" text NOT NULL,
	"balance" numeric(12, 4) NOT NULL,
	"reason" text,
	"recordedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "clinical_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" varchar(36) NOT NULL,
	"patientId" varchar(36) NOT NULL,
	"patientName" varchar(255) NOT NULL,
	"species" varchar(100) NOT NULL,
	"breed" varchar(100),
	"age" numeric(4, 1),
	"weight" numeric(6, 2),
	"ownerId" varchar(36),
	"ownerName" varchar(255),
	"chiefComplaint" text NOT NULL,
	"symptoms" text,
	"vitals" text,
	"aiDiagnosis" text,
	"differentialDiagnoses" text,
	"treatment" text,
	"medications" text,
	"followUpDate" timestamp,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"drugInteractionCheck" text,
	"govReportIncluded" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_sessions_sessionId_unique" UNIQUE("sessionId")
);
CREATE TABLE IF NOT EXISTS "continuity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"layer" text NOT NULL,
	"eventType" varchar(100) NOT NULL,
	"entityId" varchar(36) NOT NULL,
	"previousHash" varchar(64) NOT NULL,
	"data" text NOT NULL,
	"hash" varchar(64) NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "continuity_log_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tick" integer DEFAULT 0 NOT NULL,
	"event_type" text NOT NULL,
	"object_id" varchar(64),
	"detail" text,
	"previous_hash" text NOT NULL,
	"current_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "crm_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"contactId" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(320),
	"phone" varchar(50),
	"type" text DEFAULT 'LEAD' NOT NULL,
	"stage" text DEFAULT 'AWARENESS' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"source" varchar(100),
	"assignedTo" varchar(255),
	"notes" text,
	"aiInsight" text,
	"lastContactedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_contacts_contactId_unique" UNIQUE("contactId")
);
CREATE TABLE IF NOT EXISTS "evidence_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"evidenceId" varchar(20) NOT NULL,
	"category" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"verificationMethod" varchar(255),
	"actualResult" text,
	"expectedResult" text,
	"layer" text,
	"priority" integer DEFAULT 99 NOT NULL,
	"founderSigned" integer DEFAULT 0 NOT NULL,
	"verifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_registry_evidenceId_unique" UNIQUE("evidenceId")
);
CREATE TABLE IF NOT EXISTS "exchange_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"objectId" integer NOT NULL,
	"producer" varchar(255) NOT NULL,
	"consumer" varchar(255) NOT NULL,
	"stage" text NOT NULL,
	"exchangeType" text NOT NULL,
	"trustScore" numeric(4, 2) NOT NULL,
	"eiScore" numeric(4, 2),
	"status" text DEFAULT 'INITIATED' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
CREATE TABLE IF NOT EXISTS "governance_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"decisionType" text NOT NULL,
	"objectId" integer,
	"outcome" text NOT NULL,
	"rationale" text NOT NULL,
	"constraintBasis" varchar(255),
	"reversibility" integer DEFAULT 0 NOT NULL,
	"decidedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "gps_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventId" varchar(36) NOT NULL,
	"entityId" varchar(36) NOT NULL,
	"entityType" text NOT NULL,
	"latitude" numeric(10, 8) NOT NULL,
	"longitude" numeric(11, 8) NOT NULL,
	"speed" numeric(6, 2),
	"heading" integer,
	"appointmentId" varchar(36),
	"expectedArrival" timestamp,
	"estimatedDelay" integer,
	"delayAlertSent" integer DEFAULT 0 NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gps_events_eventId_unique" UNIQUE("eventId")
);
CREATE TABLE IF NOT EXISTS "intelligence_objects" (
	"id" serial PRIMARY KEY NOT NULL,
	"objectId" varchar(36) NOT NULL,
	"objectType" text NOT NULL,
	"lifecycleState" text DEFAULT 'RAW' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"originSource" text NOT NULL,
	"creatorIdentity" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastModified" timestamp DEFAULT now() NOT NULL,
	"amanahScore" numeric(4, 2) DEFAULT '0.50' NOT NULL,
	"ownershipClass" text NOT NULL,
	"validationStatus" text DEFAULT 'UNVALIDATED' NOT NULL,
	"validationEvidence" text,
	"understandingRung" integer DEFAULT 0 NOT NULL,
	"capitalCategory" text,
	"capitalValue" numeric(12, 4) DEFAULT '0',
	"content" text NOT NULL,
	"contentHash" varchar(64) NOT NULL,
	"semanticSummary" text,
	"privacyLevel" text DEFAULT 'INSTITUTIONAL' NOT NULL,
	"trustScore" numeric(4, 2) DEFAULT '0.50' NOT NULL,
	"governanceFlags" varchar(255),
	"shadowStatus" text DEFAULT 'NOT_SHADOW' NOT NULL,
	"sourceId" integer,
	"customAttributes" text,
	CONSTRAINT "intelligence_objects_objectId_unique" UNIQUE("objectId")
);
CREATE TABLE IF NOT EXISTS "inventory_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"itemCode" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"nameAr" varchar(255),
	"category" text NOT NULL,
	"unit" varchar(50) NOT NULL,
	"currentStock" numeric(10, 2) NOT NULL,
	"minStock" numeric(10, 2) NOT NULL,
	"maxStock" numeric(10, 2),
	"costPrice" numeric(10, 2),
	"sellingPrice" numeric(10, 2),
	"expiryDate" timestamp,
	"supplier" varchar(255),
	"drugInteractions" text,
	"requiresPrescription" integer DEFAULT 0 NOT NULL,
	"isActive" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_itemCode_unique" UNIQUE("itemCode")
);
CREATE TABLE IF NOT EXISTS "iuc_snapshots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"tuc" numeric(14, 6) NOT NULL,
	"ugr" numeric(14, 6) DEFAULT '0.000000' NOT NULL,
	"urs" numeric(14, 6) DEFAULT '0.000000' NOT NULL,
	"ksr" numeric(14, 6) DEFAULT '0.000000' NOT NULL,
	"pdr" numeric(14, 6) DEFAULT '0.000000' NOT NULL,
	"krr" numeric(14, 6) DEFAULT '0.000000' NOT NULL,
	"kor" numeric(14, 6) DEFAULT '0.000000' NOT NULL,
	"scg" numeric(14, 6) DEFAULT '0.000000' NOT NULL,
	"sai" numeric(14, 6) DEFAULT '0.000000' NOT NULL,
	"object_count" integer DEFAULT 0 NOT NULL,
	"snapshot_hash" text NOT NULL
);
CREATE TABLE IF NOT EXISTS "iurg_objects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"rank" text DEFAULT 'R1' NOT NULL,
	"strength" numeric(12, 6) DEFAULT '0.500000' NOT NULL,
	"verification" text DEFAULT 'UNVERIFIED' NOT NULL,
	"content" text,
	"context" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"decay_applied_at" timestamp,
	"hash_chain" text
);
CREATE TABLE IF NOT EXISTS "lab_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"labId" varchar(36) NOT NULL,
	"patientId" varchar(36) NOT NULL,
	"sessionId" varchar(36),
	"testType" text NOT NULL,
	"testName" varchar(255) NOT NULL,
	"results" text NOT NULL,
	"referenceRange" text,
	"aiInterpretation" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"flagged" integer DEFAULT 0 NOT NULL,
	"collectedAt" timestamp,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lab_results_labId_unique" UNIQUE("labId")
);
CREATE TABLE IF NOT EXISTS "learning_transitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"objectId" integer NOT NULL,
	"fromState" varchar(50) NOT NULL,
	"toState" varchar(50) NOT NULL,
	"trigger" varchar(255) NOT NULL,
	"evidence" text,
	"uqiBefore" numeric(4, 2),
	"uqiAfter" numeric(4, 2),
	"promotedBy" text DEFAULT 'SYSTEM' NOT NULL,
	"transitionAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"objectId" integer,
	"measurementType" text NOT NULL,
	"value" numeric(6, 4) NOT NULL,
	"windowType" text DEFAULT 'REALTIME' NOT NULL,
	"details" text,
	"measuredAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"notificationId" varchar(36) NOT NULL,
	"recipientId" varchar(255) NOT NULL,
	"channel" text NOT NULL,
	"type" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"data" text,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"scheduledAt" timestamp,
	"sentAt" timestamp,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_notificationId_unique" UNIQUE("notificationId")
);
CREATE TABLE IF NOT EXISTS "object_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"fromObjectId" integer NOT NULL,
	"toObjectId" integer NOT NULL,
	"relationshipType" text NOT NULL,
	"strength" numeric(4, 2) DEFAULT '0.50' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "onx_platform_event_inbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" varchar(100) NOT NULL,
	"event_id" integer NOT NULL,
	"event_type" varchar(200) NOT NULL,
	"aggregate_type" varchar(200) NOT NULL,
	"aggregate_id" varchar(200) NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"payload" jsonb,
	"received_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "provenance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"objectId" integer NOT NULL,
	"dimension" text NOT NULL,
	"value" text NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL,
	"hash" varchar(64) NOT NULL
);
CREATE TABLE IF NOT EXISTS "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"layer" text NOT NULL,
	"trustScore" numeric(4, 2) DEFAULT '0.50' NOT NULL,
	"description" text,
	"isActive" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"unionId" varchar(255) NOT NULL,
	"name" varchar(255),
	"email" varchar(320),
	"avatar" text,
	"role" text DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignInAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_unionId_unique" UNIQUE("unionId")
);
CREATE TABLE IF NOT EXISTS "voice_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" varchar(36) NOT NULL,
	"userId" varchar(255),
	"direction" text NOT NULL,
	"language" varchar(10) DEFAULT 'ar' NOT NULL,
	"inputText" text,
	"outputText" text,
	"audioDurationMs" integer,
	"model" varchar(100),
	"tokensUsed" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "voice_sessions_sessionId_unique" UNIQUE("sessionId")
);

CREATE INDEX IF NOT EXISTS "analytics_reports_ar_type_idx" ON "analytics_reports" USING btree ("type");
CREATE INDEX IF NOT EXISTS "analytics_reports_ar_period_idx" ON "analytics_reports" USING btree ("period");
CREATE INDEX IF NOT EXISTS "bi_metrics_bi_cat_idx" ON "bi_metrics" USING btree ("category");
CREATE INDEX IF NOT EXISTS "bi_metrics_bi_period_idx" ON "bi_metrics" USING btree ("period");
CREATE INDEX IF NOT EXISTS "branches_br_status_idx" ON "branches" USING btree ("status");
CREATE INDEX IF NOT EXISTS "branches_br_region_idx" ON "branches" USING btree ("region");
CREATE INDEX IF NOT EXISTS "call_center_tickets_cc_status_idx" ON "call_center_tickets" USING btree ("status");
CREATE INDEX IF NOT EXISTS "call_center_tickets_cc_priority_idx" ON "call_center_tickets" USING btree ("priority");
CREATE INDEX IF NOT EXISTS "capital_records_cap_obj_idx" ON "capital_records" USING btree ("objectId");
CREATE INDEX IF NOT EXISTS "capital_records_cap_cat_idx" ON "capital_records" USING btree ("category");
CREATE INDEX IF NOT EXISTS "clinical_sessions_cs_patient_idx" ON "clinical_sessions" USING btree ("patientId");
CREATE INDEX IF NOT EXISTS "clinical_sessions_cs_status_idx" ON "clinical_sessions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "clinical_sessions_cs_severity_idx" ON "clinical_sessions" USING btree ("severity");
CREATE INDEX IF NOT EXISTS "continuity_log_cont_layer_idx" ON "continuity_log" USING btree ("layer");
CREATE INDEX IF NOT EXISTS "continuity_log_cont_entity_idx" ON "continuity_log" USING btree ("entityId");
CREATE INDEX IF NOT EXISTS "continuity_log_cont_hash_idx" ON "continuity_log" USING btree ("hash");
CREATE INDEX IF NOT EXISTS "continuity_log_entries_continuity_tick_idx" ON "continuity_log_entries" USING btree ("tick");
CREATE INDEX IF NOT EXISTS "continuity_log_entries_continuity_obj_idx" ON "continuity_log_entries" USING btree ("object_id");
CREATE INDEX IF NOT EXISTS "continuity_log_entries_continuity_hash_idx" ON "continuity_log_entries" USING btree ("current_hash");
CREATE INDEX IF NOT EXISTS "crm_contacts_crm_type_idx" ON "crm_contacts" USING btree ("type");
CREATE INDEX IF NOT EXISTS "crm_contacts_crm_stage_idx" ON "crm_contacts" USING btree ("stage");
CREATE INDEX IF NOT EXISTS "evidence_registry_ev_cat_idx" ON "evidence_registry" USING btree ("category");
CREATE INDEX IF NOT EXISTS "evidence_registry_ev_status_idx" ON "evidence_registry" USING btree ("status");
CREATE INDEX IF NOT EXISTS "gps_events_gps_entity_idx" ON "gps_events" USING btree ("entityId");
CREATE INDEX IF NOT EXISTS "gps_events_gps_recorded_idx" ON "gps_events" USING btree ("recordedAt");
CREATE INDEX IF NOT EXISTS "intelligence_objects_type_idx" ON "intelligence_objects" USING btree ("objectType");
CREATE INDEX IF NOT EXISTS "intelligence_objects_state_idx" ON "intelligence_objects" USING btree ("lifecycleState");
CREATE INDEX IF NOT EXISTS "intelligence_objects_amanah_idx" ON "intelligence_objects" USING btree ("amanahScore");
CREATE INDEX IF NOT EXISTS "intelligence_objects_origin_idx" ON "intelligence_objects" USING btree ("originSource");
CREATE INDEX IF NOT EXISTS "intelligence_objects_ownership_idx" ON "intelligence_objects" USING btree ("ownershipClass");
CREATE INDEX IF NOT EXISTS "intelligence_objects_created_idx" ON "intelligence_objects" USING btree ("createdAt");
CREATE INDEX IF NOT EXISTS "inventory_items_inv_cat_idx" ON "inventory_items" USING btree ("category");
CREATE INDEX IF NOT EXISTS "inventory_items_inv_stock_idx" ON "inventory_items" USING btree ("currentStock");
CREATE INDEX IF NOT EXISTS "iuc_snapshots_iuc_snapshot_ts_idx" ON "iuc_snapshots" USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS "iurg_objects_iurg_type_idx" ON "iurg_objects" USING btree ("type");
CREATE INDEX IF NOT EXISTS "iurg_objects_iurg_rank_idx" ON "iurg_objects" USING btree ("rank");
CREATE INDEX IF NOT EXISTS "lab_results_lab_patient_idx" ON "lab_results" USING btree ("patientId");
CREATE INDEX IF NOT EXISTS "lab_results_lab_type_idx" ON "lab_results" USING btree ("testType");
CREATE INDEX IF NOT EXISTS "learning_transitions_trans_obj_idx" ON "learning_transitions" USING btree ("objectId");
CREATE INDEX IF NOT EXISTS "measurements_meas_obj_idx" ON "measurements" USING btree ("objectId");
CREATE INDEX IF NOT EXISTS "measurements_meas_type_idx" ON "measurements" USING btree ("measurementType");
CREATE INDEX IF NOT EXISTS "notifications_notif_recipient_idx" ON "notifications" USING btree ("recipientId");
CREATE INDEX IF NOT EXISTS "notifications_notif_status_idx" ON "notifications" USING btree ("status");
CREATE INDEX IF NOT EXISTS "notifications_notif_type_idx" ON "notifications" USING btree ("type");
CREATE INDEX IF NOT EXISTS "object_relationships_from_obj_idx" ON "object_relationships" USING btree ("fromObjectId");
CREATE INDEX IF NOT EXISTS "object_relationships_to_obj_idx" ON "object_relationships" USING btree ("toObjectId");
CREATE UNIQUE INDEX IF NOT EXISTS "onx_platform_event_inbox_inbox_source_event_idx" ON "onx_platform_event_inbox" USING btree ("source","event_id");
CREATE INDEX IF NOT EXISTS "onx_platform_event_inbox_inbox_event_type_idx" ON "onx_platform_event_inbox" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "onx_platform_event_inbox_inbox_aggregate_idx" ON "onx_platform_event_inbox" USING btree ("aggregate_type","aggregate_id");
CREATE INDEX IF NOT EXISTS "provenance_records_obj_prov_idx" ON "provenance_records" USING btree ("objectId");
CREATE INDEX IF NOT EXISTS "sources_layer_idx" ON "sources" USING btree ("layer");
`;

/**
 * Create the intelligence-object tables if absent. Idempotent and non-fatal:
 * a failure is logged and swallowed so the rest of boot proceeds, exactly like
 * the other self-provisioning stores.
 */
export async function ensureIntelligenceObjectSchema(): Promise<{ ok: boolean }> {
  const p = getPool();
  if (!p) return { ok: false };
  if (ready) return { ok: true };
  try {
    await p.query(DDL);
    ready = true;
    return { ok: true };
  } catch (err) {
    process.stderr.write(
      `[frr] ensureIntelligenceObjectSchema failed (non-fatal): ${String(err).slice(0, 160)}\n`,
    );
    return { ok: false };
  }
}
