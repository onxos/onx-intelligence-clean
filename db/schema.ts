import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  index,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================
// ONX INTELLIGENCE MINIMUM SYSTEM — Database Schema
// Source Authority: D11–D20
// ============================================================

// --- Users (existing auth table) ---
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: text("role").$type<"user" | "admin">().default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// --- Intelligence Sources (D11: 8-layer hierarchy) ---
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  layer: text("layer").$type<"L1_FOUNDER" | "L2_SIL" | "L3_COMPANION" | "L4_PARTNER" | "L5_REALITY" | "L6_PROCESS" | "L7_EXTERNAL" | "L8_GENERAL">().notNull(),
  trustScore: numeric("trustScore", { precision: 4, scale: 2 }).default("0.50").notNull(),
  description: text("description"),
  isActive: integer("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("sources_layer_idx").on(table.layer),
]);

export type Source = typeof sources.$inferSelect;

// --- Intelligence Objects (D16: 25 canonical fields, 12 types, 15 lifecycle states) ---
export const intelligenceObjects = pgTable("intelligence_objects", {
  // Core Identity (Fields 1-3)
  id: serial("id").primaryKey(),
  objectId: varchar("objectId", { length: 36 }).notNull().unique(), // UUID
  objectType: text("objectType").$type<"SIGNAL" | "PATTERN" | "UNDERSTANDING" | "JUDGMENT" | "WISDOM" | "LESSON" | "INSTITUTIONAL_INTELLIGENCE" | "FEDERATED_INTELLIGENCE" | "COMPANION_INTELLIGENCE" | "EXTERNAL_INTELLIGENCE" | "DECISION" | "STRATEGY">().notNull(),

  // Lifecycle (Field 3 extended)
  lifecycleState: text("lifecycleState").$type<"RAW" | "VALIDATING" | "VALIDATED" | "LEARNING" | "PATTERN" | "UNDERSTANDING" | "JUDGMENT" | "WISDOM" | "CAPITALIZED" | "CORRECTING" | "DECAYING" | "PRESERVED" | "REJECTED" | "DECAYED" | "ARCHIVED">().default("RAW").notNull(),

  // Version (Field 4)
  version: integer("version").default(1).notNull(),

  // Origin (Fields 5-8)
  originSource: text("originSource").$type<"L1_FOUNDER" | "L2_SIL" | "L3_COMPANION" | "L4_PARTNER" | "L5_REALITY" | "L6_PROCESS" | "L7_EXTERNAL" | "L8_GENERAL">().notNull(),
  creatorIdentity: varchar("creatorIdentity", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastModified: timestamp("lastModified").defaultNow().notNull().$onUpdate(() => new Date()),

  // Quality (Fields 9-12)
  amanahScore: numeric("amanahScore", { precision: 4, scale: 2 }).default("0.50").notNull(),
  ownershipClass: text("ownershipClass").$type<"PERSONAL" | "INSTITUTIONAL" | "SHARED" | "DERIVED" | "FEDERATED" | "EXTERNAL" | "FOUNDER_ORIGINATED">().notNull(),
  validationStatus: text("validationStatus").$type<"UNVALIDATED" | "PROVISIONAL" | "CONFIRMED" | "VALIDATED" | "CONTESTED">().default("UNVALIDATED").notNull(),
  validationEvidence: text("validationEvidence"),

  // Learning Depth (Field 13)
  understandingRung: integer("understandingRung").default(0).notNull(), // 0-6

  // Capital (Fields 14-15)
  capitalCategory: text("capitalCategory").$type<"UNDERSTANDING" | "JUDGMENT" | "WISDOM" | "RELATIONSHIP" | "INSTITUTIONAL" | "REALITY" | "FLOURISHING">(),
  capitalValue: numeric("capitalValue", { precision: 12, scale: 4 }).default("0"),

  // Content (Fields 19-20)
  content: text("content").notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  semanticSummary: text("semanticSummary"),

  // Governance (Fields 23-24)
  privacyLevel: text("privacyLevel").$type<"PERSONAL" | "INSTITUTIONAL" | "FEDERATION" | "PUBLIC" | "RESTRICTED">().default("INSTITUTIONAL").notNull(),
  trustScore: numeric("trustScore", { precision: 4, scale: 2 }).default("0.50").notNull(),
  governanceFlags: varchar("governanceFlags", { length: 255 }),

  // Shadow Protocol (D11)
  shadowStatus: text("shadowStatus").$type<"NOT_SHADOW" | "SHADOW" | "RECOGNIZED" | "REJECTED">().default("NOT_SHADOW").notNull(),

  // Source reference
  sourceId: integer("sourceId").references(() => sources.id),

  // Custom attributes (Field 25)
  customAttributes: text("customAttributes"), // JSON
}, (table) => [
  index("intelligence_objects_type_idx").on(table.objectType),
  index("intelligence_objects_state_idx").on(table.lifecycleState),
  index("intelligence_objects_amanah_idx").on(table.amanahScore),
  index("intelligence_objects_origin_idx").on(table.originSource),
  index("intelligence_objects_ownership_idx").on(table.ownershipClass),
  index("intelligence_objects_created_idx").on(table.createdAt),
]);

export type IntelligenceObject = typeof intelligenceObjects.$inferSelect;
export type InsertIntelligenceObject = typeof intelligenceObjects.$inferInsert;

// --- Provenance Records (D16: 8 dimensions) ---
export const provenanceRecords = pgTable("provenance_records", {
  id: serial("id").primaryKey(),
  objectId: integer("objectId")
    .references(() => intelligenceObjects.id)
    .notNull(),
  dimension: text("dimension").$type<"ORIGIN_SOURCE" | "CREATOR_IDENTITY" | "CREATION_TIMESTAMP" | "TRANSFORMATION_CHAIN" | "VALIDATION_HISTORY" | "EXCHANGE_HISTORY" | "OWNERSHIP_CHAIN" | "CONTEXT_RECORD">().notNull(),
  value: text("value").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  hash: varchar("hash", { length: 64 }).notNull(),
}, (table) => [
  index("provenance_records_obj_prov_idx").on(table.objectId),
]);

// --- Object Relationships (D16: 10 types) ---
export const objectRelationships = pgTable("object_relationships", {
  id: serial("id").primaryKey(),
  fromObjectId: integer("fromObjectId")
    .references(() => intelligenceObjects.id)
    .notNull(),
  toObjectId: integer("toObjectId")
    .references(() => intelligenceObjects.id)
    .notNull(),
  relationshipType: text("relationshipType").$type<"DERIVES_FROM" | "SUPPORTS" | "CONTRADICTS" | "SUPERSEDES" | "COMPLEMENTS" | "VALIDATES" | "DEPENDS_ON" | "FEEDS_INTO" | "CROSS_REFERENCES" | "ORIGINATES_FROM">().notNull(),
  strength: numeric("strength", { precision: 4, scale: 2 }).default("0.50").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("object_relationships_from_obj_idx").on(table.fromObjectId),
  index("object_relationships_to_obj_idx").on(table.toObjectId),
]);

// --- Learning Transitions (D12: 9-state machine log) ---
export const learningTransitions = pgTable("learning_transitions", {
  id: serial("id").primaryKey(),
  objectId: integer("objectId")
    .references(() => intelligenceObjects.id)
    .notNull(),
  fromState: varchar("fromState", { length: 50 }).notNull(),
  toState: varchar("toState", { length: 50 }).notNull(),
  trigger: varchar("trigger", { length: 255 }).notNull(), // What caused transition
  evidence: text("evidence"), // Evidence supporting transition
  uqiBefore: numeric("uqiBefore", { precision: 4, scale: 2 }),
  uqiAfter: numeric("uqiAfter", { precision: 4, scale: 2 }),
  promotedBy: text("promotedBy").$type<"SYSTEM" | "FOUNDER" | "VALIDATOR" | "COMPANION">().default("SYSTEM").notNull(),
  transitionAt: timestamp("transitionAt").defaultNow().notNull(),
}, (table) => [
  index("learning_transitions_trans_obj_idx").on(table.objectId),
]);

// --- Capital Records (D13: 7 categories) ---
export const capitalRecords = pgTable("capital_records", {
  id: serial("id").primaryKey(),
  objectId: integer("objectId")
    .references(() => intelligenceObjects.id)
    .notNull(),
  category: text("category").$type<"UNDERSTANDING" | "JUDGMENT" | "WISDOM" | "RELATIONSHIP" | "INSTITUTIONAL" | "REALITY" | "FLOURISHING">().notNull(),
  amount: numeric("amount", { precision: 12, scale: 4 }).notNull(),
  operation: text("operation").$type<"CREDIT" | "DEBIT" | "COMPOUND" | "TRANSFER" | "PRESERVE">().notNull(),
  balance: numeric("balance", { precision: 12, scale: 4 }).notNull(),
  reason: text("reason"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("capital_records_cap_obj_idx").on(table.objectId),
  index("capital_records_cap_cat_idx").on(table.category),
]);

// --- Measurements (D17: 6 quality indices) ---
export const measurements = pgTable("measurements", {
  id: serial("id").primaryKey(),
  objectId: integer("objectId")
    .references(() => intelligenceObjects.id),
  measurementType: text("measurementType").$type<"UQI" | "JQI" | "WQI" | "ICI" | "OQI" | "IRS" | "EI" | "TR" | "SYSTEM">().notNull(),
  value: numeric("value", { precision: 6, scale: 4 }).notNull(),
  windowType: text("windowType").$type<"REALTIME" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY">().default("REALTIME").notNull(),
  details: text("details"), // JSON
  measuredAt: timestamp("measuredAt").defaultNow().notNull(),
}, (table) => [
  index("measurements_meas_obj_idx").on(table.objectId),
  index("measurements_meas_type_idx").on(table.measurementType),
]);

// --- Continuity Log (CCP-B: Append-only, tamper-evident) ---
export const continuityLog = pgTable("continuity_log", {
  id: serial("id").primaryKey(),
  layer: text("layer").$type<"L1_SIGNAL" | "L2_OBJECT" | "L3_EVENT" | "L4_DECISION" | "L5_CAPITAL" | "L6_CONSTITUTIONAL" | "L7_INSTITUTIONAL" | "L8_FOUNDATIONAL">().notNull(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  entityId: varchar("entityId", { length: 36 }).notNull(), // UUID of affected entity
  previousHash: varchar("previousHash", { length: 64 }).notNull(),
  data: text("data").notNull(), // JSON event data
  hash: varchar("hash", { length: 64 }).notNull(), // SHA-256 of this record
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("continuity_log_cont_layer_idx").on(table.layer),
  index("continuity_log_cont_entity_idx").on(table.entityId),
  index("continuity_log_cont_hash_idx").on(table.hash),
]);

// --- Track I: IURG persistence + hourly IUC snapshots + append-only continuity entries ---
export const iurgObjects = pgTable("iurg_objects", {
  id: varchar("id", { length: 36 }).primaryKey(),
  type: text("type").$type<"PERCEPTION" | "PATTERN" | "UNDERSTANDING" | "JUDGMENT" | "DECISION" | "EXECUTION" | "OUTCOME" | "FOUNDER_INTENT" | "CONSTITUTIONAL_CONSTRAINT" | "EVIDENCE" | "REVIEW" | "AMENDMENT" | "CONFLICT" | "OVERRIDE" | "VALIDATION" | "LEARNING_EVENT">().notNull(),
  rank: text("rank").$type<"R1" | "R2" | "R3" | "R4" | "R5" | "R6">().default("R1").notNull(),
  strength: numeric("strength", { precision: 12, scale: 6 }).default("0.500000").notNull(),
  verification: text("verification").$type<"UNVERIFIED" | "POSSIBLE" | "PROBABLE" | "CONFIRMED" | "PROVEN">()
    .default("UNVERIFIED")
    .notNull(),
  content: text("content"),
  context: text("context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  decayAppliedAt: timestamp("decay_applied_at"),
  hashChain: text("hash_chain"),
}, (table) => [
  index("iurg_objects_iurg_type_idx").on(table.type),
  index("iurg_objects_iurg_rank_idx").on(table.rank),
]);

export const iucSnapshots = pgTable("iuc_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  tuc: numeric("tuc", { precision: 14, scale: 6 }).notNull(),
  ugr: numeric("ugr", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  urs: numeric("urs", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  ksr: numeric("ksr", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  pdr: numeric("pdr", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  krr: numeric("krr", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  kor: numeric("kor", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  scg: numeric("scg", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  sai: numeric("sai", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  objectCount: integer("object_count").default(0).notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
}, (table) => [
  index("iuc_snapshots_iuc_snapshot_ts_idx").on(table.timestamp),
]);

export const continuityLogEntries = pgTable("continuity_log_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tick: integer("tick").default(0).notNull(),
  eventType: text("event_type").$type<"DECAY" | "REINFORCE" | "PROMOTION" | "DEMOTION" | "GATE_PENDING" | "SNAPSHOT">().notNull(),
  objectId: varchar("object_id", { length: 64 }),
  detail: text("detail"),
  previousHash: text("previous_hash").notNull(),
  currentHash: text("current_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("continuity_log_entries_continuity_tick_idx").on(table.tick),
  index("continuity_log_entries_continuity_obj_idx").on(table.objectId),
  index("continuity_log_entries_continuity_hash_idx").on(table.currentHash),
]);

// --- Governance Decisions (FIC, Amanah, Guardian audit trail) ---
export const governanceDecisions = pgTable("governance_decisions", {
  id: serial("id").primaryKey(),
  decisionType: text("decisionType").$type<"AMANAH_CHECK" | "FIC_VALIDATION" | "PRIVACY_ENFORCEMENT" | "TRUST_VERIFICATION" | "HUMAN_GATE" | "GUARDIAN_ALERT" | "AUDITOR_LOG" | "FOUNDER_OVERRIDE">().notNull(),
  objectId: integer("objectId")
    .references(() => intelligenceObjects.id),
  outcome: text("outcome").$type<"PASSED" | "BLOCKED" | "CONDITIONAL" | "FLAGGED" | "OVERRIDDEN">().notNull(),
  rationale: text("rationale").notNull(),
  constraintBasis: varchar("constraintBasis", { length: 255 }),
  reversibility: integer("reversibility").default(0).notNull(), // 0=false, 1=true
  decidedAt: timestamp("decidedAt").defaultNow().notNull(),
});

// --- Exchange Records (D19: 9-stage pipeline log) ---
export const exchangeRecords = pgTable("exchange_records", {
  id: serial("id").primaryKey(),
  objectId: integer("objectId")
    .references(() => intelligenceObjects.id)
    .notNull(),
  producer: varchar("producer", { length: 255 }).notNull(),
  consumer: varchar("consumer", { length: 255 }).notNull(),
  stage: text("stage").$type<"PRODUCER" | "VALIDATION" | "PACKAGING" | "TRANSFER" | "VERIFICATION" | "INTEGRATION" | "MEASUREMENT" | "LEARNING" | "CAPITALIZATION" | "CLOSED">().notNull(),
  exchangeType: text("exchangeType").$type<"DIRECT" | "PEER" | "HIERARCHICAL" | "FEDERATED" | "EXTERNAL" | "CASCADE">().notNull(),
  trustScore: numeric("trustScore", { precision: 4, scale: 2 }).notNull(),
  eiScore: numeric("eiScore", { precision: 4, scale: 2 }),
  status: text("status").$type<"INITIATED" | "COMPLETED" | "REJECTED" | "SUSPICIOUS">().default("INITIATED").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

// ============================================================
// EVIDENCE REGISTRY — 69 Acceptance Criteria Records
// Tracks all UEP acceptance criteria: P0, P1, Milestones, Domains
// ============================================================
export const evidenceRegistry = pgTable("evidence_registry", {
  id: serial("id").primaryKey(),
  evidenceId: varchar("evidenceId", { length: 20 }).notNull().unique(), // EV-P0-01, EV-M01, etc.
  category: text("category").$type<"P0_CRITICAL" | "P1_HIGH" | "P2_MEDIUM" | "MILESTONE" | "DOMAIN" | "LAYER" | "LAUNCH">().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: text("status").$type<"PENDING" | "IN_PROGRESS" | "PASSED" | "FAILED" | "WAIVED">().default("PENDING").notNull(),
  verificationMethod: varchar("verificationMethod", { length: 255 }),
  actualResult: text("actualResult"),
  expectedResult: text("expectedResult"),
  layer: text("layer").$type<"L0" | "L1" | "L2" | "L3" | "L4" | "L5">(),
  priority: integer("priority").default(99).notNull(),
  founderSigned: integer("founderSigned").default(0).notNull(), // 0=false, 1=true
  verifiedAt: timestamp("verifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("evidence_registry_ev_cat_idx").on(table.category),
  index("evidence_registry_ev_status_idx").on(table.status),
]);

export type EvidenceRecord = typeof evidenceRegistry.$inferSelect;
export type InsertEvidenceRecord = typeof evidenceRegistry.$inferInsert;

// ============================================================
// CONSCIOUSNESS CYCLES — Scheduler execution log
// ============================================================
export const consciousnessCycles = pgTable("consciousness_cycles", {
  id: serial("id").primaryKey(),
  rhythmId: varchar("rhythmId", { length: 50 }).notNull(),
  rhythmName: varchar("rhythmName", { length: 100 }).notNull(),
  cycleNumber: integer("cycleNumber").default(1).notNull(),
  status: text("status").$type<"RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED">().default("RUNNING").notNull(),
  actionsExecuted: text("actionsExecuted"), // JSON array
  metricsSnapshot: text("metricsSnapshot"), // JSON
  healthScore: numeric("healthScore", { precision: 4, scale: 2 }),
  anomaliesDetected: integer("anomaliesDetected").default(0).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: integer("durationMs"),
}, (table) => [
  index("consciousness_cycles_cc_rhythm_idx").on(table.rhythmId),
  index("consciousness_cycles_cc_status_idx").on(table.status),
  index("consciousness_cycles_cc_started_idx").on(table.startedAt),
]);

export type ConsciousnessCycle = typeof consciousnessCycles.$inferSelect;

// ============================================================
// VOICE SESSIONS — Arabic STT/TTS records
// ============================================================
export const voiceSessions = pgTable("voice_sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("sessionId", { length: 36 }).notNull().unique(),
  userId: varchar("userId", { length: 255 }),
  direction: text("direction").$type<"STT" | "TTS">().notNull(),
  language: varchar("language", { length: 10 }).default("ar").notNull(),
  inputText: text("inputText"),
  outputText: text("outputText"),
  audioDurationMs: integer("audioDurationMs"),
  model: varchar("model", { length: 100 }),
  tokensUsed: integer("tokensUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================================
// DOMAIN TABLES — D01-D19 Skill Layer
// ============================================================

// D01: Call Center Operations
export const callCenterTickets = pgTable("call_center_tickets", {
  id: serial("id").primaryKey(),
  ticketId: varchar("ticketId", { length: 36 }).notNull().unique(),
  customerId: varchar("customerId", { length: 255 }),
  agentId: varchar("agentId", { length: 255 }),
  category: text("category").$type<"APPOINTMENT" | "BILLING" | "COMPLAINT" | "INQUIRY" | "EMERGENCY" | "FOLLOWUP">().notNull(),
  priority: text("priority").$type<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">().default("MEDIUM").notNull(),
  status: text("status").$type<"OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED" | "CLOSED">().default("OPEN").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description"),
  resolution: text("resolution"),
  aiFeedback: text("aiFeedback"), // GPT-4o analysis
  satisfactionScore: numeric("satisfactionScore", { precision: 3, scale: 1 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("call_center_tickets_cc_status_idx").on(table.status),
  index("call_center_tickets_cc_priority_idx").on(table.priority),
]);

// D04: Veterinary Clinical Records
export const clinicalSessions = pgTable("clinical_sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("sessionId", { length: 36 }).notNull().unique(),
  patientId: varchar("patientId", { length: 36 }).notNull(),
  patientName: varchar("patientName", { length: 255 }).notNull(),
  species: varchar("species", { length: 100 }).notNull(),
  breed: varchar("breed", { length: 100 }),
  age: numeric("age", { precision: 4, scale: 1 }),
  weight: numeric("weight", { precision: 6, scale: 2 }),
  ownerId: varchar("ownerId", { length: 36 }),
  ownerName: varchar("ownerName", { length: 255 }),
  chiefComplaint: text("chiefComplaint").notNull(),
  symptoms: text("symptoms"), // JSON array
  vitals: text("vitals"), // JSON: temp, hr, rr, weight
  aiDiagnosis: text("aiDiagnosis"), // GPT-4o generated
  differentialDiagnoses: text("differentialDiagnoses"), // JSON
  treatment: text("treatment"),
  medications: text("medications"), // JSON array
  followUpDate: timestamp("followUpDate"),
  severity: text("severity").$type<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "EMERGENCY">().default("MEDIUM").notNull(),
  status: text("status").$type<"OPEN" | "DIAGNOSED" | "TREATING" | "RESOLVED" | "REFERRED">().default("OPEN").notNull(),
  drugInteractionCheck: text("drugInteractionCheck"), // GPT-4o drug check result
  govReportIncluded: integer("govReportIncluded").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("clinical_sessions_cs_patient_idx").on(table.patientId),
  index("clinical_sessions_cs_status_idx").on(table.status),
  index("clinical_sessions_cs_severity_idx").on(table.severity),
]);

// D05: Inventory & Pharmacy
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  itemCode: varchar("itemCode", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  category: text("category").$type<"MEDICINE" | "VACCINE" | "EQUIPMENT" | "CONSUMABLE" | "FEED" | "SUPPLEMENT">().notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  currentStock: numeric("currentStock", { precision: 10, scale: 2 }).notNull(),
  minStock: numeric("minStock", { precision: 10, scale: 2 }).notNull(),
  maxStock: numeric("maxStock", { precision: 10, scale: 2 }),
  costPrice: numeric("costPrice", { precision: 10, scale: 2 }),
  sellingPrice: numeric("sellingPrice", { precision: 10, scale: 2 }),
  expiryDate: timestamp("expiryDate"),
  supplier: varchar("supplier", { length: 255 }),
  drugInteractions: text("drugInteractions"), // JSON list
  requiresPrescription: integer("requiresPrescription").default(0).notNull(),
  isActive: integer("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("inventory_items_inv_cat_idx").on(table.category),
  index("inventory_items_inv_stock_idx").on(table.currentStock),
]);

// D06: Marketing & CRM
export const crmContacts = pgTable("crm_contacts", {
  id: serial("id").primaryKey(),
  contactId: varchar("contactId", { length: 36 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  type: text("type").$type<"LEAD" | "PROSPECT" | "CUSTOMER" | "VIP" | "PARTNER">().default("LEAD").notNull(),
  stage: text("stage").$type<"AWARENESS" | "INTEREST" | "CONSIDERATION" | "INTENT" | "PURCHASE" | "RETENTION">().default("AWARENESS").notNull(),
  score: integer("score").default(0).notNull(),
  source: varchar("source", { length: 100 }),
  assignedTo: varchar("assignedTo", { length: 255 }),
  notes: text("notes"),
  aiInsight: text("aiInsight"), // GPT-4o analysis
  lastContactedAt: timestamp("lastContactedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("crm_contacts_crm_type_idx").on(table.type),
  index("crm_contacts_crm_stage_idx").on(table.stage),
]);

// D08: Reporting & Analytics
export const analyticsReports = pgTable("analytics_reports", {
  id: serial("id").primaryKey(),
  reportId: varchar("reportId", { length: 36 }).notNull().unique(),
  type: text("type").$type<"DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL" | "MOA_GOVERNMENT" | "CLINICAL" | "FINANCIAL" | "OPERATIONAL">().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  period: varchar("period", { length: 50 }).notNull(), // "2025-Q1", "2025-07"
  data: text("data").notNull(), // JSON report data
  aiSummary: text("aiSummary"), // GPT-4o generated summary
  moaFormat: integer("moaFormat").default(0).notNull(), // Is MOA government format
  generatedBy: varchar("generatedBy", { length: 100 }),
  status: text("status").$type<"DRAFT" | "REVIEWING" | "APPROVED" | "PUBLISHED">().default("DRAFT").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("analytics_reports_ar_type_idx").on(table.type),
  index("analytics_reports_ar_period_idx").on(table.period),
]);

// D10: Laboratory & Diagnostics
export const labResults = pgTable("lab_results", {
  id: serial("id").primaryKey(),
  labId: varchar("labId", { length: 36 }).notNull().unique(),
  patientId: varchar("patientId", { length: 36 }).notNull(),
  sessionId: varchar("sessionId", { length: 36 }),
  testType: text("testType").$type<"CBC" | "BIOCHEMISTRY" | "URINALYSIS" | "MICROBIOLOGY" | "PARASITOLOGY" | "SEROLOGY" | "PATHOLOGY" | "IMAGING">().notNull(),
  testName: varchar("testName", { length: 255 }).notNull(),
  results: text("results").notNull(), // JSON
  referenceRange: text("referenceRange"), // JSON
  aiInterpretation: text("aiInterpretation"), // GPT-4o analysis
  status: text("status").$type<"PENDING" | "PROCESSING" | "COMPLETED" | "REVIEWED">().default("PENDING").notNull(),
  flagged: integer("flagged").default(0).notNull(),
  collectedAt: timestamp("collectedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("lab_results_lab_patient_idx").on(table.patientId),
  index("lab_results_lab_type_idx").on(table.testType),
]);

// D14: Business Intelligence
export const biMetrics = pgTable("bi_metrics", {
  id: serial("id").primaryKey(),
  metricId: varchar("metricId", { length: 36 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  category: text("category").$type<"REVENUE" | "PATIENTS" | "EFFICIENCY" | "SATISFACTION" | "GROWTH" | "COMPLIANCE" | "AI_PERFORMANCE">().notNull(),
  value: numeric("value", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 50 }),
  period: varchar("period", { length: 50 }).notNull(),
  target: numeric("target", { precision: 15, scale: 4 }),
  benchmark: numeric("benchmark", { precision: 15, scale: 4 }),
  trend: text("trend").$type<"UP" | "DOWN" | "STABLE" | "VOLATILE">().default("STABLE"),
  aiAnalysis: text("aiAnalysis"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("bi_metrics_bi_cat_idx").on(table.category),
  index("bi_metrics_bi_period_idx").on(table.period),
]);

// D15: Organization & Branches
export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  branchId: varchar("branchId", { length: 36 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  type: text("type").$type<"PILOT" | "MAIN" | "SATELLITE" | "MOBILE">().default("PILOT").notNull(),
  status: text("status").$type<"PLANNING" | "ACTIVE" | "PAUSED" | "CLOSED">().default("PLANNING").notNull(),
  city: varchar("city", { length: 100 }),
  region: varchar("region", { length: 100 }),
  country: varchar("country", { length: 100 }).default("SA"),
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
  managerName: varchar("managerName", { length: 255 }),
  staffCount: integer("staffCount").default(0).notNull(),
  patientsPerDay: integer("patientsPerDay").default(0).notNull(),
  revenueTarget: numeric("revenueTarget", { precision: 15, scale: 2 }),
  aiHealthScore: numeric("aiHealthScore", { precision: 4, scale: 2 }),
  launchDate: timestamp("launchDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("branches_br_status_idx").on(table.status),
  index("branches_br_region_idx").on(table.region),
]);

// D18: Communication & Notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  notificationId: varchar("notificationId", { length: 36 }).notNull().unique(),
  recipientId: varchar("recipientId", { length: 255 }).notNull(),
  channel: text("channel").$type<"PUSH" | "SMS" | "EMAIL" | "WHATSAPP" | "IN_APP">().notNull(),
  type: text("type").$type<"APPOINTMENT_REMINDER" | "RESULT_READY" | "PAYMENT_DUE" | "ALERT" | "REPORT_READY" | "GPS_DELAY" | "SYSTEM">().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  data: text("data"), // JSON payload
  priority: text("priority").$type<"LOW" | "MEDIUM" | "HIGH" | "URGENT">().default("MEDIUM").notNull(),
  status: text("status").$type<"PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED">().default("PENDING").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("notifications_notif_recipient_idx").on(table.recipientId),
  index("notifications_notif_status_idx").on(table.status),
  index("notifications_notif_type_idx").on(table.type),
]);

// GPS Tracking for D07 (delivery/mobile services)
export const gpsEvents = pgTable("gps_events", {
  id: serial("id").primaryKey(),
  eventId: varchar("eventId", { length: 36 }).notNull().unique(),
  entityId: varchar("entityId", { length: 36 }).notNull(), // vehicle/person ID
  entityType: text("entityType").$type<"VEHICLE" | "STAFF" | "MOBILE_UNIT">().notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: numeric("longitude", { precision: 11, scale: 8 }).notNull(),
  speed: numeric("speed", { precision: 6, scale: 2 }),
  heading: integer("heading"),
  appointmentId: varchar("appointmentId", { length: 36 }),
  expectedArrival: timestamp("expectedArrival"),
  estimatedDelay: integer("estimatedDelay"), // minutes
  delayAlertSent: integer("delayAlertSent").default(0).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("gps_events_gps_entity_idx").on(table.entityId),
  index("gps_events_gps_recorded_idx").on(table.recordedAt),
]);

// --- Phase C3a: Platform → Intelligence event inbox (bridge ingest) ---
export const onxPlatformEventInbox = pgTable("onx_platform_event_inbox", {
  id: serial("id").primaryKey(),
  source: varchar("source", { length: 100 }).notNull(),
  eventId: integer("event_id").notNull(),
  eventType: varchar("event_type", { length: 200 }).notNull(),
  aggregateType: varchar("aggregate_type", { length: 200 }).notNull(),
  aggregateId: varchar("aggregate_id", { length: 200 }).notNull(),
  occurredAt: timestamp("occurred_at").notNull(),
  payload: jsonb("payload"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("onx_platform_event_inbox_inbox_source_event_idx").on(table.source, table.eventId),
  index("onx_platform_event_inbox_inbox_event_type_idx").on(table.eventType),
  index("onx_platform_event_inbox_inbox_aggregate_idx").on(table.aggregateType, table.aggregateId),
]);

export type PlatformEventInbox = typeof onxPlatformEventInbox.$inferSelect;
export type InsertPlatformEventInbox = typeof onxPlatformEventInbox.$inferInsert;
