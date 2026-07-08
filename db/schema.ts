import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  decimal,
  bigint,
  int,
  index,
} from "drizzle-orm/mysql-core";

// ============================================================
// ONX INTELLIGENCE MINIMUM SYSTEM — Database Schema
// Source Authority: D11–D20
// ============================================================

// --- Users (existing auth table) ---
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// --- Intelligence Sources (D11: 8-layer hierarchy) ---
export const sources = mysqlTable("sources", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  layer: mysqlEnum("layer", [
    "L1_FOUNDER",
    "L2_SIL",
    "L3_COMPANION",
    "L4_PARTNER",
    "L5_REALITY",
    "L6_PROCESS",
    "L7_EXTERNAL",
    "L8_GENERAL",
  ]).notNull(),
  trustScore: decimal("trustScore", { precision: 4, scale: 2 }).default("0.50").notNull(),
  description: text("description"),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("layer_idx").on(table.layer),
]);

export type Source = typeof sources.$inferSelect;

// --- Intelligence Objects (D16: 25 canonical fields, 12 types, 15 lifecycle states) ---
export const intelligenceObjects = mysqlTable("intelligence_objects", {
  // Core Identity (Fields 1-3)
  id: serial("id").primaryKey(),
  objectId: varchar("objectId", { length: 36 }).notNull().unique(), // UUID
  objectType: mysqlEnum("objectType", [
    "SIGNAL",
    "PATTERN",
    "UNDERSTANDING",
    "JUDGMENT",
    "WISDOM",
    "LESSON",
    "INSTITUTIONAL_INTELLIGENCE",
    "FEDERATED_INTELLIGENCE",
    "COMPANION_INTELLIGENCE",
    "EXTERNAL_INTELLIGENCE",
    "DECISION",
    "STRATEGY",
  ]).notNull(),

  // Lifecycle (Field 3 extended)
  lifecycleState: mysqlEnum("lifecycleState", [
    "RAW",
    "VALIDATING",
    "VALIDATED",
    "LEARNING",
    "PATTERN",
    "UNDERSTANDING",
    "JUDGMENT",
    "WISDOM",
    "CAPITALIZED",
    "CORRECTING",
    "DECAYING",
    "PRESERVED",
    "REJECTED",
    "DECAYED",
    "ARCHIVED",
  ]).default("RAW").notNull(),

  // Version (Field 4)
  version: int("version").default(1).notNull(),

  // Origin (Fields 5-8)
  originSource: mysqlEnum("originSource", [
    "L1_FOUNDER",
    "L2_SIL",
    "L3_COMPANION",
    "L4_PARTNER",
    "L5_REALITY",
    "L6_PROCESS",
    "L7_EXTERNAL",
    "L8_GENERAL",
  ]).notNull(),
  creatorIdentity: varchar("creatorIdentity", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastModified: timestamp("lastModified").defaultNow().notNull().$onUpdate(() => new Date()),

  // Quality (Fields 9-12)
  amanahScore: decimal("amanahScore", { precision: 4, scale: 2 }).default("0.50").notNull(),
  ownershipClass: mysqlEnum("ownershipClass", [
    "PERSONAL",
    "INSTITUTIONAL",
    "SHARED",
    "DERIVED",
    "FEDERATED",
    "EXTERNAL",
    "FOUNDER_ORIGINATED",
  ]).notNull(),
  validationStatus: mysqlEnum("validationStatus", [
    "UNVALIDATED",
    "PROVISIONAL",
    "CONFIRMED",
    "VALIDATED",
    "CONTESTED",
  ]).default("UNVALIDATED").notNull(),
  validationEvidence: text("validationEvidence"),

  // Learning Depth (Field 13)
  understandingRung: int("understandingRung").default(0).notNull(), // 0-6

  // Capital (Fields 14-15)
  capitalCategory: mysqlEnum("capitalCategory", [
    "UNDERSTANDING",
    "JUDGMENT",
    "WISDOM",
    "RELATIONSHIP",
    "INSTITUTIONAL",
    "REALITY",
    "FLOURISHING",
  ]),
  capitalValue: decimal("capitalValue", { precision: 12, scale: 4 }).default("0"),

  // Content (Fields 19-20)
  content: text("content").notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  semanticSummary: text("semanticSummary"),

  // Governance (Fields 23-24)
  privacyLevel: mysqlEnum("privacyLevel", [
    "PERSONAL",
    "INSTITUTIONAL",
    "FEDERATION",
    "PUBLIC",
    "RESTRICTED",
  ]).default("INSTITUTIONAL").notNull(),
  trustScore: decimal("trustScore", { precision: 4, scale: 2 }).default("0.50").notNull(),
  governanceFlags: varchar("governanceFlags", { length: 255 }),

  // Shadow Protocol (D11)
  shadowStatus: mysqlEnum("shadowStatus", [
    "NOT_SHADOW",
    "SHADOW",
    "RECOGNIZED",
    "REJECTED",
  ]).default("NOT_SHADOW").notNull(),

  // Source reference
  sourceId: bigint("sourceId", { mode: "number", unsigned: true }).references(() => sources.id),

  // Custom attributes (Field 25)
  customAttributes: text("customAttributes"), // JSON
}, (table) => [
  index("type_idx").on(table.objectType),
  index("state_idx").on(table.lifecycleState),
  index("amanah_idx").on(table.amanahScore),
  index("origin_idx").on(table.originSource),
  index("ownership_idx").on(table.ownershipClass),
  index("created_idx").on(table.createdAt),
]);

export type IntelligenceObject = typeof intelligenceObjects.$inferSelect;
export type InsertIntelligenceObject = typeof intelligenceObjects.$inferInsert;

// --- Provenance Records (D16: 8 dimensions) ---
export const provenanceRecords = mysqlTable("provenance_records", {
  id: serial("id").primaryKey(),
  objectId: bigint("objectId", { mode: "number", unsigned: true })
    .references(() => intelligenceObjects.id)
    .notNull(),
  dimension: mysqlEnum("dimension", [
    "ORIGIN_SOURCE",
    "CREATOR_IDENTITY",
    "CREATION_TIMESTAMP",
    "TRANSFORMATION_CHAIN",
    "VALIDATION_HISTORY",
    "EXCHANGE_HISTORY",
    "OWNERSHIP_CHAIN",
    "CONTEXT_RECORD",
  ]).notNull(),
  value: text("value").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  hash: varchar("hash", { length: 64 }).notNull(),
}, (table) => [
  index("obj_prov_idx").on(table.objectId),
]);

// --- Object Relationships (D16: 10 types) ---
export const objectRelationships = mysqlTable("object_relationships", {
  id: serial("id").primaryKey(),
  fromObjectId: bigint("fromObjectId", { mode: "number", unsigned: true })
    .references(() => intelligenceObjects.id)
    .notNull(),
  toObjectId: bigint("toObjectId", { mode: "number", unsigned: true })
    .references(() => intelligenceObjects.id)
    .notNull(),
  relationshipType: mysqlEnum("relationshipType", [
    "DERIVES_FROM",
    "SUPPORTS",
    "CONTRADICTS",
    "SUPERSEDES",
    "COMPLEMENTS",
    "VALIDATES",
    "DEPENDS_ON",
    "FEEDS_INTO",
    "CROSS_REFERENCES",
    "ORIGINATES_FROM",
  ]).notNull(),
  strength: decimal("strength", { precision: 4, scale: 2 }).default("0.50").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("from_obj_idx").on(table.fromObjectId),
  index("to_obj_idx").on(table.toObjectId),
]);

// --- Learning Transitions (D12: 9-state machine log) ---
export const learningTransitions = mysqlTable("learning_transitions", {
  id: serial("id").primaryKey(),
  objectId: bigint("objectId", { mode: "number", unsigned: true })
    .references(() => intelligenceObjects.id)
    .notNull(),
  fromState: varchar("fromState", { length: 50 }).notNull(),
  toState: varchar("toState", { length: 50 }).notNull(),
  trigger: varchar("trigger", { length: 255 }).notNull(), // What caused transition
  evidence: text("evidence"), // Evidence supporting transition
  uqiBefore: decimal("uqiBefore", { precision: 4, scale: 2 }),
  uqiAfter: decimal("uqiAfter", { precision: 4, scale: 2 }),
  promotedBy: mysqlEnum("promotedBy", ["SYSTEM", "FOUNDER", "VALIDATOR", "COMPANION"]).default("SYSTEM").notNull(),
  transitionAt: timestamp("transitionAt").defaultNow().notNull(),
}, (table) => [
  index("trans_obj_idx").on(table.objectId),
]);

// --- Capital Records (D13: 7 categories) ---
export const capitalRecords = mysqlTable("capital_records", {
  id: serial("id").primaryKey(),
  objectId: bigint("objectId", { mode: "number", unsigned: true })
    .references(() => intelligenceObjects.id)
    .notNull(),
  category: mysqlEnum("category", [
    "UNDERSTANDING",
    "JUDGMENT",
    "WISDOM",
    "RELATIONSHIP",
    "INSTITUTIONAL",
    "REALITY",
    "FLOURISHING",
  ]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 4 }).notNull(),
  operation: mysqlEnum("operation", ["CREDIT", "DEBIT", "COMPOUND", "TRANSFER", "PRESERVE"]).notNull(),
  balance: decimal("balance", { precision: 12, scale: 4 }).notNull(),
  reason: text("reason"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("cap_obj_idx").on(table.objectId),
  index("cap_cat_idx").on(table.category),
]);

// --- Measurements (D17: 6 quality indices) ---
export const measurements = mysqlTable("measurements", {
  id: serial("id").primaryKey(),
  objectId: bigint("objectId", { mode: "number", unsigned: true })
    .references(() => intelligenceObjects.id),
  measurementType: mysqlEnum("measurementType", [
    "UQI",
    "JQI",
    "WQI",
    "ICI",
    "OQI",
    "IRS",
    "EI",
    "TR",
    "SYSTEM",
  ]).notNull(),
  value: decimal("value", { precision: 6, scale: 4 }).notNull(),
  windowType: mysqlEnum("windowType", [
    "REALTIME",
    "HOURLY",
    "DAILY",
    "WEEKLY",
    "MONTHLY",
    "QUARTERLY",
  ]).default("REALTIME").notNull(),
  details: text("details"), // JSON
  measuredAt: timestamp("measuredAt").defaultNow().notNull(),
}, (table) => [
  index("meas_obj_idx").on(table.objectId),
  index("meas_type_idx").on(table.measurementType),
]);

// --- Continuity Log (CCP-B: Append-only, tamper-evident) ---
export const continuityLog = mysqlTable("continuity_log", {
  id: serial("id").primaryKey(),
  layer: mysqlEnum("layer", [
    "L1_SIGNAL",
    "L2_OBJECT",
    "L3_EVENT",
    "L4_DECISION",
    "L5_CAPITAL",
    "L6_CONSTITUTIONAL",
    "L7_INSTITUTIONAL",
    "L8_FOUNDATIONAL",
  ]).notNull(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  entityId: varchar("entityId", { length: 36 }).notNull(), // UUID of affected entity
  previousHash: varchar("previousHash", { length: 64 }).notNull(),
  data: text("data").notNull(), // JSON event data
  hash: varchar("hash", { length: 64 }).notNull(), // SHA-256 of this record
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("cont_layer_idx").on(table.layer),
  index("cont_entity_idx").on(table.entityId),
  index("cont_hash_idx").on(table.hash),
]);

// --- Track I: IURG persistence + hourly IUC snapshots + append-only continuity entries ---
export const iurgObjects = mysqlTable("iurg_objects", {
  id: varchar("id", { length: 36 }).primaryKey(),
  type: mysqlEnum("type", [
    "PERCEPTION", "PATTERN", "UNDERSTANDING", "JUDGMENT", "DECISION", "EXECUTION", "OUTCOME",
    "FOUNDER_INTENT", "CONSTITUTIONAL_CONSTRAINT",
    "EVIDENCE", "REVIEW", "AMENDMENT", "CONFLICT", "OVERRIDE", "VALIDATION", "LEARNING_EVENT",
  ]).notNull(),
  rank: mysqlEnum("rank", ["R1", "R2", "R3", "R4", "R5", "R6"]).default("R1").notNull(),
  strength: decimal("strength", { precision: 12, scale: 6 }).default("0.500000").notNull(),
  verification: mysqlEnum("verification", ["UNVERIFIED", "POSSIBLE", "PROBABLE", "CONFIRMED", "PROVEN"])
    .default("UNVERIFIED")
    .notNull(),
  content: text("content"),
  context: text("context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  decayAppliedAt: timestamp("decay_applied_at"),
  hashChain: text("hash_chain"),
}, (table) => [
  index("iurg_type_idx").on(table.type),
  index("iurg_rank_idx").on(table.rank),
]);

export const iucSnapshots = mysqlTable("iuc_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  tuc: decimal("tuc", { precision: 14, scale: 6 }).notNull(),
  ugr: decimal("ugr", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  urs: decimal("urs", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  ksr: decimal("ksr", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  pdr: decimal("pdr", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  krr: decimal("krr", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  kor: decimal("kor", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  scg: decimal("scg", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  sai: decimal("sai", { precision: 14, scale: 6 }).default("0.000000").notNull(),
  objectCount: int("object_count").default(0).notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
}, (table) => [
  index("iuc_snapshot_ts_idx").on(table.timestamp),
]);

export const continuityLogEntries = mysqlTable("continuity_log_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tick: int("tick").default(0).notNull(),
  eventType: mysqlEnum("event_type", ["DECAY", "REINFORCE", "PROMOTION", "DEMOTION", "GATE_PENDING", "SNAPSHOT"]).notNull(),
  objectId: varchar("object_id", { length: 64 }),
  detail: text("detail"),
  previousHash: text("previous_hash").notNull(),
  currentHash: text("current_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("continuity_tick_idx").on(table.tick),
  index("continuity_obj_idx").on(table.objectId),
  index("continuity_hash_idx").on(table.currentHash),
]);

// --- Governance Decisions (FIC, Amanah, Guardian audit trail) ---
export const governanceDecisions = mysqlTable("governance_decisions", {
  id: serial("id").primaryKey(),
  decisionType: mysqlEnum("decisionType", [
    "AMANAH_CHECK",
    "FIC_VALIDATION",
    "PRIVACY_ENFORCEMENT",
    "TRUST_VERIFICATION",
    "HUMAN_GATE",
    "GUARDIAN_ALERT",
    "AUDITOR_LOG",
    "FOUNDER_OVERRIDE",
  ]).notNull(),
  objectId: bigint("objectId", { mode: "number", unsigned: true })
    .references(() => intelligenceObjects.id),
  outcome: mysqlEnum("outcome", ["PASSED", "BLOCKED", "CONDITIONAL", "FLAGGED", "OVERRIDDEN"]).notNull(),
  rationale: text("rationale").notNull(),
  constraintBasis: varchar("constraintBasis", { length: 255 }),
  reversibility: int("reversibility").default(0).notNull(), // 0=false, 1=true
  decidedAt: timestamp("decidedAt").defaultNow().notNull(),
});

// --- Exchange Records (D19: 9-stage pipeline log) ---
export const exchangeRecords = mysqlTable("exchange_records", {
  id: serial("id").primaryKey(),
  objectId: bigint("objectId", { mode: "number", unsigned: true })
    .references(() => intelligenceObjects.id)
    .notNull(),
  producer: varchar("producer", { length: 255 }).notNull(),
  consumer: varchar("consumer", { length: 255 }).notNull(),
  stage: mysqlEnum("stage", [
    "PRODUCER",
    "VALIDATION",
    "PACKAGING",
    "TRANSFER",
    "VERIFICATION",
    "INTEGRATION",
    "MEASUREMENT",
    "LEARNING",
    "CAPITALIZATION",
    "CLOSED",
  ]).notNull(),
  exchangeType: mysqlEnum("exchangeType", [
    "DIRECT",
    "PEER",
    "HIERARCHICAL",
    "FEDERATED",
    "EXTERNAL",
    "CASCADE",
  ]).notNull(),
  trustScore: decimal("trustScore", { precision: 4, scale: 2 }).notNull(),
  eiScore: decimal("eiScore", { precision: 4, scale: 2 }),
  status: mysqlEnum("status", ["INITIATED", "COMPLETED", "REJECTED", "SUSPICIOUS"]).default("INITIATED").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

// ============================================================
// EVIDENCE REGISTRY — 69 Acceptance Criteria Records
// Tracks all UEP acceptance criteria: P0, P1, Milestones, Domains
// ============================================================
export const evidenceRegistry = mysqlTable("evidence_registry", {
  id: serial("id").primaryKey(),
  evidenceId: varchar("evidenceId", { length: 20 }).notNull().unique(), // EV-P0-01, EV-M01, etc.
  category: mysqlEnum("category", [
    "P0_CRITICAL", "P1_HIGH", "P2_MEDIUM",
    "MILESTONE", "DOMAIN", "LAYER", "LAUNCH",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", [
    "PENDING", "IN_PROGRESS", "PASSED", "FAILED", "WAIVED",
  ]).default("PENDING").notNull(),
  verificationMethod: varchar("verificationMethod", { length: 255 }),
  actualResult: text("actualResult"),
  expectedResult: text("expectedResult"),
  layer: mysqlEnum("layer", ["L0", "L1", "L2", "L3", "L4", "L5"]),
  priority: int("priority").default(99).notNull(),
  founderSigned: int("founderSigned").default(0).notNull(), // 0=false, 1=true
  verifiedAt: timestamp("verifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("ev_cat_idx").on(table.category),
  index("ev_status_idx").on(table.status),
]);

export type EvidenceRecord = typeof evidenceRegistry.$inferSelect;
export type InsertEvidenceRecord = typeof evidenceRegistry.$inferInsert;

// ============================================================
// CONSCIOUSNESS CYCLES — Scheduler execution log
// ============================================================
export const consciousnessCycles = mysqlTable("consciousness_cycles", {
  id: serial("id").primaryKey(),
  rhythmId: varchar("rhythmId", { length: 50 }).notNull(),
  rhythmName: varchar("rhythmName", { length: 100 }).notNull(),
  cycleNumber: int("cycleNumber").default(1).notNull(),
  status: mysqlEnum("status", ["RUNNING", "COMPLETED", "FAILED", "SKIPPED"]).default("RUNNING").notNull(),
  actionsExecuted: text("actionsExecuted"), // JSON array
  metricsSnapshot: text("metricsSnapshot"), // JSON
  healthScore: decimal("healthScore", { precision: 4, scale: 2 }),
  anomaliesDetected: int("anomaliesDetected").default(0).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),
}, (table) => [
  index("cc_rhythm_idx").on(table.rhythmId),
  index("cc_status_idx").on(table.status),
  index("cc_started_idx").on(table.startedAt),
]);

export type ConsciousnessCycle = typeof consciousnessCycles.$inferSelect;

// ============================================================
// VOICE SESSIONS — Arabic STT/TTS records
// ============================================================
export const voiceSessions = mysqlTable("voice_sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("sessionId", { length: 36 }).notNull().unique(),
  userId: varchar("userId", { length: 255 }),
  direction: mysqlEnum("direction", ["STT", "TTS"]).notNull(),
  language: varchar("language", { length: 10 }).default("ar").notNull(),
  inputText: text("inputText"),
  outputText: text("outputText"),
  audioDurationMs: int("audioDurationMs"),
  model: varchar("model", { length: 100 }),
  tokensUsed: int("tokensUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================================
// DOMAIN TABLES — D01-D19 Skill Layer
// ============================================================

// D01: Call Center Operations
export const callCenterTickets = mysqlTable("call_center_tickets", {
  id: serial("id").primaryKey(),
  ticketId: varchar("ticketId", { length: 36 }).notNull().unique(),
  customerId: varchar("customerId", { length: 255 }),
  agentId: varchar("agentId", { length: 255 }),
  category: mysqlEnum("category", [
    "APPOINTMENT", "BILLING", "COMPLAINT", "INQUIRY", "EMERGENCY", "FOLLOWUP",
  ]).notNull(),
  priority: mysqlEnum("priority", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM").notNull(),
  status: mysqlEnum("status", ["OPEN", "IN_PROGRESS", "RESOLVED", "ESCALATED", "CLOSED"]).default("OPEN").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description"),
  resolution: text("resolution"),
  aiFeedback: text("aiFeedback"), // GPT-4o analysis
  satisfactionScore: decimal("satisfactionScore", { precision: 3, scale: 1 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("cc_status_idx").on(table.status),
  index("cc_priority_idx").on(table.priority),
]);

// D04: Veterinary Clinical Records
export const clinicalSessions = mysqlTable("clinical_sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("sessionId", { length: 36 }).notNull().unique(),
  patientId: varchar("patientId", { length: 36 }).notNull(),
  patientName: varchar("patientName", { length: 255 }).notNull(),
  species: varchar("species", { length: 100 }).notNull(),
  breed: varchar("breed", { length: 100 }),
  age: decimal("age", { precision: 4, scale: 1 }),
  weight: decimal("weight", { precision: 6, scale: 2 }),
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
  severity: mysqlEnum("severity", ["LOW", "MEDIUM", "HIGH", "CRITICAL", "EMERGENCY"]).default("MEDIUM").notNull(),
  status: mysqlEnum("status", ["OPEN", "DIAGNOSED", "TREATING", "RESOLVED", "REFERRED"]).default("OPEN").notNull(),
  drugInteractionCheck: text("drugInteractionCheck"), // GPT-4o drug check result
  govReportIncluded: int("govReportIncluded").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("cs_patient_idx").on(table.patientId),
  index("cs_status_idx").on(table.status),
  index("cs_severity_idx").on(table.severity),
]);

// D05: Inventory & Pharmacy
export const inventoryItems = mysqlTable("inventory_items", {
  id: serial("id").primaryKey(),
  itemCode: varchar("itemCode", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  category: mysqlEnum("category", [
    "MEDICINE", "VACCINE", "EQUIPMENT", "CONSUMABLE", "FEED", "SUPPLEMENT",
  ]).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  currentStock: decimal("currentStock", { precision: 10, scale: 2 }).notNull(),
  minStock: decimal("minStock", { precision: 10, scale: 2 }).notNull(),
  maxStock: decimal("maxStock", { precision: 10, scale: 2 }),
  costPrice: decimal("costPrice", { precision: 10, scale: 2 }),
  sellingPrice: decimal("sellingPrice", { precision: 10, scale: 2 }),
  expiryDate: timestamp("expiryDate"),
  supplier: varchar("supplier", { length: 255 }),
  drugInteractions: text("drugInteractions"), // JSON list
  requiresPrescription: int("requiresPrescription").default(0).notNull(),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("inv_cat_idx").on(table.category),
  index("inv_stock_idx").on(table.currentStock),
]);

// D06: Marketing & CRM
export const crmContacts = mysqlTable("crm_contacts", {
  id: serial("id").primaryKey(),
  contactId: varchar("contactId", { length: 36 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  type: mysqlEnum("type", ["LEAD", "PROSPECT", "CUSTOMER", "VIP", "PARTNER"]).default("LEAD").notNull(),
  stage: mysqlEnum("stage", ["AWARENESS", "INTEREST", "CONSIDERATION", "INTENT", "PURCHASE", "RETENTION"]).default("AWARENESS").notNull(),
  score: int("score").default(0).notNull(),
  source: varchar("source", { length: 100 }),
  assignedTo: varchar("assignedTo", { length: 255 }),
  notes: text("notes"),
  aiInsight: text("aiInsight"), // GPT-4o analysis
  lastContactedAt: timestamp("lastContactedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("crm_type_idx").on(table.type),
  index("crm_stage_idx").on(table.stage),
]);

// D08: Reporting & Analytics
export const analyticsReports = mysqlTable("analytics_reports", {
  id: serial("id").primaryKey(),
  reportId: varchar("reportId", { length: 36 }).notNull().unique(),
  type: mysqlEnum("type", [
    "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL",
    "MOA_GOVERNMENT", "CLINICAL", "FINANCIAL", "OPERATIONAL",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  period: varchar("period", { length: 50 }).notNull(), // "2025-Q1", "2025-07"
  data: text("data").notNull(), // JSON report data
  aiSummary: text("aiSummary"), // GPT-4o generated summary
  moaFormat: int("moaFormat").default(0).notNull(), // Is MOA government format
  generatedBy: varchar("generatedBy", { length: 100 }),
  status: mysqlEnum("status", ["DRAFT", "REVIEWING", "APPROVED", "PUBLISHED"]).default("DRAFT").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("ar_type_idx").on(table.type),
  index("ar_period_idx").on(table.period),
]);

// D10: Laboratory & Diagnostics
export const labResults = mysqlTable("lab_results", {
  id: serial("id").primaryKey(),
  labId: varchar("labId", { length: 36 }).notNull().unique(),
  patientId: varchar("patientId", { length: 36 }).notNull(),
  sessionId: varchar("sessionId", { length: 36 }),
  testType: mysqlEnum("testType", [
    "CBC", "BIOCHEMISTRY", "URINALYSIS", "MICROBIOLOGY",
    "PARASITOLOGY", "SEROLOGY", "PATHOLOGY", "IMAGING",
  ]).notNull(),
  testName: varchar("testName", { length: 255 }).notNull(),
  results: text("results").notNull(), // JSON
  referenceRange: text("referenceRange"), // JSON
  aiInterpretation: text("aiInterpretation"), // GPT-4o analysis
  status: mysqlEnum("status", ["PENDING", "PROCESSING", "COMPLETED", "REVIEWED"]).default("PENDING").notNull(),
  flagged: int("flagged").default(0).notNull(),
  collectedAt: timestamp("collectedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("lab_patient_idx").on(table.patientId),
  index("lab_type_idx").on(table.testType),
]);

// D14: Business Intelligence
export const biMetrics = mysqlTable("bi_metrics", {
  id: serial("id").primaryKey(),
  metricId: varchar("metricId", { length: 36 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  category: mysqlEnum("category", [
    "REVENUE", "PATIENTS", "EFFICIENCY", "SATISFACTION",
    "GROWTH", "COMPLIANCE", "AI_PERFORMANCE",
  ]).notNull(),
  value: decimal("value", { precision: 15, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 50 }),
  period: varchar("period", { length: 50 }).notNull(),
  target: decimal("target", { precision: 15, scale: 4 }),
  benchmark: decimal("benchmark", { precision: 15, scale: 4 }),
  trend: mysqlEnum("trend", ["UP", "DOWN", "STABLE", "VOLATILE"]).default("STABLE"),
  aiAnalysis: text("aiAnalysis"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("bi_cat_idx").on(table.category),
  index("bi_period_idx").on(table.period),
]);

// D15: Organization & Branches
export const branches = mysqlTable("branches", {
  id: serial("id").primaryKey(),
  branchId: varchar("branchId", { length: 36 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  type: mysqlEnum("type", ["PILOT", "MAIN", "SATELLITE", "MOBILE"]).default("PILOT").notNull(),
  status: mysqlEnum("status", ["PLANNING", "ACTIVE", "PAUSED", "CLOSED"]).default("PLANNING").notNull(),
  city: varchar("city", { length: 100 }),
  region: varchar("region", { length: 100 }),
  country: varchar("country", { length: 100 }).default("SA"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  managerName: varchar("managerName", { length: 255 }),
  staffCount: int("staffCount").default(0).notNull(),
  patientsPerDay: int("patientsPerDay").default(0).notNull(),
  revenueTarget: decimal("revenueTarget", { precision: 15, scale: 2 }),
  aiHealthScore: decimal("aiHealthScore", { precision: 4, scale: 2 }),
  launchDate: timestamp("launchDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("br_status_idx").on(table.status),
  index("br_region_idx").on(table.region),
]);

// D18: Communication & Notifications
export const notifications = mysqlTable("notifications", {
  id: serial("id").primaryKey(),
  notificationId: varchar("notificationId", { length: 36 }).notNull().unique(),
  recipientId: varchar("recipientId", { length: 255 }).notNull(),
  channel: mysqlEnum("channel", ["PUSH", "SMS", "EMAIL", "WHATSAPP", "IN_APP"]).notNull(),
  type: mysqlEnum("type", [
    "APPOINTMENT_REMINDER", "RESULT_READY", "PAYMENT_DUE",
    "ALERT", "REPORT_READY", "GPS_DELAY", "SYSTEM",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  data: text("data"), // JSON payload
  priority: mysqlEnum("priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM").notNull(),
  status: mysqlEnum("status", ["PENDING", "SENT", "DELIVERED", "READ", "FAILED"]).default("PENDING").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("notif_recipient_idx").on(table.recipientId),
  index("notif_status_idx").on(table.status),
  index("notif_type_idx").on(table.type),
]);

// GPS Tracking for D07 (delivery/mobile services)
export const gpsEvents = mysqlTable("gps_events", {
  id: serial("id").primaryKey(),
  eventId: varchar("eventId", { length: 36 }).notNull().unique(),
  entityId: varchar("entityId", { length: 36 }).notNull(), // vehicle/person ID
  entityType: mysqlEnum("entityType", ["VEHICLE", "STAFF", "MOBILE_UNIT"]).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  speed: decimal("speed", { precision: 6, scale: 2 }),
  heading: int("heading"),
  appointmentId: varchar("appointmentId", { length: 36 }),
  expectedArrival: timestamp("expectedArrival"),
  estimatedDelay: int("estimatedDelay"), // minutes
  delayAlertSent: int("delayAlertSent").default(0).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("gps_entity_idx").on(table.entityId),
  index("gps_recorded_idx").on(table.recordedAt),
]);
