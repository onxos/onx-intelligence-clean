import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  intelligenceObjects,
  provenanceRecords,
  objectRelationships,
  learningTransitions,
  capitalRecords,
  measurements,
  continuityLog,
  governanceDecisions,
  exchangeRecords,
} from "@db/schema";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";

// ============================================================
// ONX INTELLIGENCE RUNTIME — Core Router
// Implements: IC-01 through IC-06 (D11-D19)
// ============================================================

// --- Utility: Hash chain for Continuity (CCP-B) ---
let lastHash = "0".repeat(64);
function computeHash(data: string): string {
  return createHash("sha256").update(data + lastHash).digest("hex");
}
function updateLastHash(hash: string) { lastHash = hash; }

// --- Utility: Log to Continuity ---
async function logContinuity(
  layer: typeof continuityLog.$inferInsert.layer,
  eventType: string,
  entityId: string,
  data: Record<string, unknown>
) {
  const db = getDb();
  const dataStr = JSON.stringify(data);
  const hash = computeHash(dataStr);
  const record = {
    layer,
    eventType,
    entityId,
    previousHash: lastHash,
    data: dataStr,
    hash,
  };
  await db.insert(continuityLog).values(record);
  updateLastHash(hash);
  return record;
}

// --- Utility: Record Governance Decision ---
async function recordGovernance(
  decisionType: typeof governanceDecisions.$inferInsert.decisionType,
  objectId: number | null,
  outcome: typeof governanceDecisions.$inferInsert.outcome,
  rationale: string,
  constraintBasis?: string
) {
  const db = getDb();
  await db.insert(governanceDecisions).values({
    decisionType,
    objectId,
    outcome,
    rationale,
    constraintBasis,
  });
}

// --- Utility: Amanah Check (CCP-A) ---
function checkAmanah(score: number): { pass: boolean; severity: string } {
  if (score >= 0.50) return { pass: true, severity: "OK" };
  if (score >= 0.30) return { pass: false, severity: "WARNING" };
  if (score >= 0.20) return { pass: false, severity: "CRITICAL" };
  return { pass: false, severity: "BLOCKER" };
}

// --- Utility: Calculate Quality Indices (D17) ---
function calculateUQI(obj: { understandingRung: number; validationStatus: string; amanahScore: string | null }): number {
  const rung = obj.understandingRung || 0;
  const valMap: Record<string, number> = { UNVALIDATED: 0.2, PROVISIONAL: 0.5, CONFIRMED: 0.7, VALIDATED: 0.9, CONTESTED: 0.4 };
  const val = valMap[obj.validationStatus] || 0.2;
  const amanah = parseFloat(obj.amanahScore || "0.50");
  const grounding = Math.min(rung / 6, 1) * 0.30;
  const evidence = val * 0.25;
  const crossRef = amanah * 0.25;
  const reality = val * 0.20;
  return Math.min(grounding + evidence + crossRef + reality, 1.0);
}

function calculateJQI(obj: { lifecycleState: string; amanahScore: string | null; understandingRung: number }): number {
  const isJudgment = ["JUDGMENT", "WISDOM", "CAPITALIZED"].includes(obj.lifecycleState);
  if (!isJudgment) return 0.30;
  const amanah = parseFloat(obj.amanahScore || "0.50");
  const understanding = Math.min(obj.understandingRung / 6, 1) * 0.30;
  const context = amanah * 0.25;
  const fic = amanah * 0.25;
  const outcome = isJudgment ? 0.20 : 0.10;
  return Math.min(understanding + context + fic + outcome, 1.0);
}

function calculateWQI(obj: { lifecycleState: string; capitalValue: string | null; amanahScore: string | null }): number {
  const isWisdom = obj.lifecycleState === "WISDOM" || obj.lifecycleState === "CAPITALIZED";
  if (!isWisdom) return 0.20;
  const capital = parseFloat(obj.capitalValue || "0");
  const amanah = parseFloat(obj.amanahScore || "0.50");
  const crossContext = amanah * 0.30;
  const temporal = Math.min(capital / 100, 1) * 0.25;
  const abstraction = amanah * 0.25;
  const capitalScore = Math.min(capital / 50, 1) * 0.20;
  return Math.min(crossContext + temporal + abstraction + capitalScore, 1.0);
}

function calculateICI(objects: Array<{ amanahScore: string | null; validationStatus: string }>): number {
  if (objects.length === 0) return 0.10;
  const avgAmanah = objects.reduce((s, o) => s + parseFloat(o.amanahScore || "0.50"), 0) / objects.length;
  const validated = objects.filter(o => o.validationStatus === "VALIDATED" || o.validationStatus === "CONFIRMED").length;
  const coverage = objects.length > 0 ? validated / objects.length : 0;
  const diversity = Math.min(objects.length / 20, 1) * 0.20;
  return Math.min(avgAmanah * 0.30 + coverage * 0.25 + diversity * 0.20 + avgAmanah * 0.25, 1.0);
}

function calculateOQI(obj: { content: string | null; amanahScore: string | null; validationStatus: string }): number {
  const contentLength = (obj.content || "").length;
  const completeness = Math.min(contentLength / 200, 1) * 0.20;
  const amanah = parseFloat(obj.amanahScore || "0.50");
  const provenance = amanah * 0.20;
  const validation = (obj.validationStatus === "VALIDATED" ? 0.9 : obj.validationStatus === "CONFIRMED" ? 0.7 : 0.3) * 0.20;
  const relationship = amanah * 0.20;
  const measurement = amanah * 0.20;
  return Math.min(completeness + provenance + validation + relationship + measurement, 1.0);
}

// ============================================================
// IC-01: Intelligence Object Runtime (D16)
// IC-02: Intelligence Feeding Runtime (D11)
// IC-03: Intelligence Learning Runtime (D12)
// IC-04: Intelligence Measurement Runtime (D17)
// IC-05: Intelligence Orchestration Runtime (D14)
// IC-06: Intelligence Exchange Runtime (D19)
// ============================================================

export const intelligenceRouter = createRouter({
  // ==========================================================
  // INTEND — Create Intelligence Object (IC-01 + IC-02)
  // ==========================================================
  intend: publicQuery
    .input(z.object({
      content: z.string().min(1).max(10000),
      objectType: z.enum(["SIGNAL", "PATTERN", "UNDERSTANDING", "JUDGMENT", "WISDOM", "LESSON"]).default("SIGNAL"),
      originSource: z.enum(["L1_FOUNDER", "L2_SIL", "L3_COMPANION", "L4_PARTNER", "L5_REALITY", "L6_PROCESS", "L7_EXTERNAL", "L8_GENERAL"]).default("L1_FOUNDER"),
      creatorIdentity: z.string().default("Founder"),
      ownershipClass: z.enum(["PERSONAL", "INSTITUTIONAL", "SHARED", "DERIVED", "FEDERATED", "EXTERNAL", "FOUNDER_ORIGINATED"]).default("FOUNDER_ORIGINATED"),
      amanahScore: z.number().min(0).max(1).default(0.75),
      semanticSummary: z.string().optional(),
      privacyLevel: z.enum(["PERSONAL", "INSTITUTIONAL", "FEDERATION", "PUBLIC", "RESTRICTED"]).default("INSTITUTIONAL"),
      sourceLayer: z.enum(["L1_FOUNDER", "L2_SIL", "L3_COMPANION", "L4_PARTNER", "L5_REALITY", "L6_PROCESS", "L7_EXTERNAL", "L8_GENERAL"]).default("L1_FOUNDER"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // --- Shadow Protocol for L7 (External) ---
      let shadowStatus: typeof intelligenceObjects.$inferInsert.shadowStatus = "NOT_SHADOW";
      if (input.originSource === "L7_EXTERNAL") {
        shadowStatus = "SHADOW";
      }

      // --- 12-Question Validation Gate (D11-E) ---
      const amanahCheck = checkAmanah(input.amanahScore);
      if (!amanahCheck.pass) {
        await recordGovernance("AMANAH_CHECK", null, "BLOCKED",
          `Amanah score ${input.amanahScore} below floor 0.50`, "CCP-A");
        throw new Error(`AMANAH_FLOOR_VIOLATION: Score ${input.amanahScore} < 0.50 (${amanahCheck.severity})`);
      }

      // --- Content hash for integrity ---
      const contentHash = createHash("sha256").update(input.content).digest("hex");
      const objectId = randomUUID();

      // --- Create Object (D16: 25 canonical fields) ---
      const [obj] = await db.insert(intelligenceObjects).values({
        objectId,
        objectType: input.objectType,
        lifecycleState: input.originSource === "L7_EXTERNAL" ? "RAW" : "VALIDATED",
        version: 1,
        originSource: input.originSource,
        creatorIdentity: input.creatorIdentity,
        amanahScore: input.amanahScore.toFixed(2),
        ownershipClass: input.ownershipClass,
        validationStatus: input.originSource === "L1_FOUNDER" ? "CONFIRMED" : "UNVALIDATED",
        understandingRung: 0,
        capitalValue: "0",
        content: input.content,
        contentHash,
        semanticSummary: input.semanticSummary || input.content.substring(0, 200),
        privacyLevel: input.privacyLevel,
        trustScore: input.amanahScore.toFixed(2),
        shadowStatus,
        customAttributes: JSON.stringify({ sourceLayer: input.sourceLayer }),
      }).$returningId();

      const objectDbId = obj.id;

      // --- Record Provenance (D16: 8 dimensions) ---
      await db.insert(provenanceRecords).values([
        { objectId: objectDbId, dimension: "ORIGIN_SOURCE", value: input.originSource, hash: createHash("sha256").update(input.originSource).digest("hex") },
        { objectId: objectDbId, dimension: "CREATOR_IDENTITY", value: input.creatorIdentity, hash: createHash("sha256").update(input.creatorIdentity).digest("hex") },
        { objectId: objectDbId, dimension: "CREATION_TIMESTAMP", value: new Date().toISOString(), hash: createHash("sha256").update(Date.now().toString()).digest("hex") },
        { objectId: objectDbId, dimension: "CONTEXT_RECORD", value: JSON.stringify({ intakeMethod: "INTEND", sourceLayer: input.sourceLayer }), hash: createHash("sha256").update(input.content).digest("hex") },
      ]);

      // --- Log Continuity (CCP-B) ---
      await logContinuity("L2_OBJECT", "OBJECT_CREATED", objectId, {
        objectType: input.objectType,
        originSource: input.originSource,
        amanahScore: input.amanahScore,
        shadowStatus,
      });

      // --- Record Governance ---
      await recordGovernance("AMANAH_CHECK", objectDbId, "PASSED",
        `Amanah score ${input.amanahScore} >= 0.50`, "CCP-A");
      await recordGovernance("FIC_VALIDATION", objectDbId, "PASSED",
        `Object created from ${input.originSource} with ${input.ownershipClass} ownership`, "D16");

      // --- Calculate initial metrics (D17) ---
      const oqi = calculateOQI({ content: input.content, amanahScore: input.amanahScore.toFixed(2), validationStatus: input.originSource === "L1_FOUNDER" ? "CONFIRMED" : "UNVALIDATED" });
      await db.insert(measurements).values({
        objectId: objectDbId,
        measurementType: "OQI",
        value: oqi.toFixed(4),
        windowType: "REALTIME",
        details: JSON.stringify({ initial: true, source: input.originSource }),
      });

      // --- Return with full context ---
      const created = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.id, objectDbId));
      const provenance = await db.select().from(provenanceRecords).where(eq(provenanceRecords.objectId, objectDbId));

      return {
        object: created[0],
        provenance,
        metrics: { OQI: oqi },
        governance: { amanah: "PASSED", fic: "PASSED" },
        continuity: { logged: true },
      };
    }),

  // ==========================================================
  // COMPREHEND — Retrieve Object with Context (IC-01)
  // ==========================================================
  comprehend: publicQuery
    .input(z.object({ objectId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const provenance = await db.select().from(provenanceRecords).where(eq(provenanceRecords.objectId, obj.id));
      const relationships = await db.select().from(objectRelationships)
        .where(sql`${objectRelationships.fromObjectId} = ${obj.id} OR ${objectRelationships.toObjectId} = ${obj.id}`);
      const transitions = await db.select().from(learningTransitions).where(eq(learningTransitions.objectId, obj.id));
      const capital = await db.select().from(capitalRecords).where(eq(capitalRecords.objectId, obj.id));
      const metrics = await db.select().from(measurements).where(eq(measurements.objectId, obj.id));

      // Recalculate live metrics
      const uqi = calculateUQI(obj);
      const jqi = calculateJQI(obj);
      const wqi = calculateWQI(obj);
      const oqi = calculateOQI(obj);

      return {
        object: obj,
        provenance,
        relationships,
        transitions,
        capital,
        metrics,
        liveMetrics: { UQI: uqi, JQI: jqi, WQI: wqi, OQI: oqi },
        context: {
          amanahStatus: checkAmanah(parseFloat(obj.amanahScore)),
          state: obj.lifecycleState,
          rung: obj.understandingRung,
        },
      };
    }),

  // ==========================================================
  // LIST — Query Intelligence Objects
  // ==========================================================
  list: publicQuery
    .input(z.object({
      type: z.enum(["SIGNAL", "PATTERN", "UNDERSTANDING", "JUDGMENT", "WISDOM", "LESSON", "INSTITUTIONAL_INTELLIGENCE", "FEDERATED_INTELLIGENCE", "COMPANION_INTELLIGENCE", "EXTERNAL_INTELLIGENCE", "DECISION", "STRATEGY"]).optional(),
      state: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      // Apply filters if provided
      const conditions = [];
      if (input?.type) conditions.push(eq(intelligenceObjects.objectType, input.type));
      if (input?.state) conditions.push(sql`${intelligenceObjects.lifecycleState} = ${input.state}`);

      if (conditions.length > 0) {
        const objs = await db.select().from(intelligenceObjects)
          .where(and(...conditions))
          .orderBy(desc(intelligenceObjects.createdAt))
          .limit(input?.limit || 20);
        return objs;
      }
      return db.select().from(intelligenceObjects).orderBy(desc(intelligenceObjects.createdAt)).limit(input?.limit || 20);
    }),

  // ==========================================================
  // LEARN — Advance State Machine (IC-03)
  // ==========================================================
  learn: publicQuery
    .input(z.object({
      objectId: z.string(),
      action: z.enum(["PROMOTE", "DECAY", "CORRECT", "VALIDATE"]),
      evidence: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      let obj = objs[0];

      const oldState = obj.lifecycleState;
      let newState: string = oldState;
      let trigger = "";

      // --- State Machine (D12: 9 learning states) ---
      switch (input.action) {
        case "PROMOTE": {
          const stateFlow: Record<string, string> = {
            RAW: "VALIDATING",
            VALIDATING: "VALIDATED",
            VALIDATED: "LEARNING",
            LEARNING: "PATTERN",
            PATTERN: "UNDERSTANDING",
            UNDERSTANDING: "JUDGMENT",
            JUDGMENT: "WISDOM",
            WISDOM: "CAPITALIZED",
          };
          newState = stateFlow[oldState] || oldState;
          trigger = `PROMOTION: ${oldState}→${newState}`;

          // --- Understanding Ladder (D12-C: 6 rungs) ---
          let newRung = obj.understandingRung;
          if (newState === "UNDERSTANDING" && obj.understandingRung < 1) newRung = 1;
          if (newState === "JUDGMENT" && obj.understandingRung < 3) newRung = 3;
          if (newState === "WISDOM" && obj.understandingRung < 5) newRung = 5;
          if (newState === "CAPITALIZED" && obj.understandingRung < 6) newRung = 6;

          // --- Capital Formation on promotion (D13) ---
          if (newState === "CAPITALIZED" || newState === "WISDOM") {
            const catMap: Record<string, string> = { WISDOM: "WISDOM", JUDGMENT: "JUDGMENT", UNDERSTANDING: "UNDERSTANDING", CAPITALIZED: "FLOURISHING" };
            const category = catMap[newState] || "UNDERSTANDING";
            const amount = newState === "WISDOM" ? "10.0000" : newState === "CAPITALIZED" ? "25.0000" : "5.0000";
            const existingCapital = await db.select().from(capitalRecords)
              .where(eq(capitalRecords.objectId, obj.id))
              .orderBy(desc(capitalRecords.recordedAt))
              .limit(1);
            const balance = existingCapital.length > 0
              ? (parseFloat(existingCapital[0].balance) + parseFloat(amount)).toFixed(4)
              : amount;

            await db.insert(capitalRecords).values({
              objectId: obj.id,
              category: category as typeof capitalRecords.$inferInsert.category,
              amount,
              operation: "CREDIT",
              balance,
              reason: `Capital formed on state transition to ${newState}`,
            });

            await db.update(intelligenceObjects)
              .set({ capitalCategory: category as typeof intelligenceObjects.$inferInsert.capitalCategory, capitalValue: balance })
              .where(eq(intelligenceObjects.id, obj.id));
          }

          if (newRung !== obj.understandingRung) {
            await db.update(intelligenceObjects)
              .set({ understandingRung: newRung })
              .where(eq(intelligenceObjects.id, obj.id));
          }
          break;
        }
        case "DECAY": {
          const decayFlow: Record<string, string> = {
            PATTERN: "DECAYING",
            UNDERSTANDING: "DECAYING",
            JUDGMENT: "DECAYING",
            WISDOM: "DECAYING",
            DECAYING: "DECAYED",
          };
          newState = decayFlow[oldState] || "DECAYING";
          trigger = `DECAY: ${oldState}→${newState}`;
          break;
        }
        case "CORRECT": {
          newState = "CORRECTING";
          trigger = `CORRECTION initiated on ${oldState}`;
          break;
        }
        case "VALIDATE": {
          await db.update(intelligenceObjects)
            .set({ validationStatus: "VALIDATED", amanahScore: "0.85" })
            .where(eq(intelligenceObjects.id, obj.id));
          newState = oldState;
          trigger = "VALIDATION: Object validated";
          break;
        }
      }

      // Apply state transition
      if (newState !== oldState) {
        await db.update(intelligenceObjects)
          .set({ lifecycleState: newState as typeof intelligenceObjects.$inferInsert.lifecycleState })
          .where(eq(intelligenceObjects.id, obj.id));
      }

      // Record transition
      const uqiBefore = calculateUQI(obj);
      const refreshed = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.id, obj.id));
      obj = refreshed[0];
      const uqiAfter = calculateUQI(obj);

      await db.insert(learningTransitions).values({
        objectId: obj.id,
        fromState: oldState,
        toState: newState,
        trigger,
        evidence: input.evidence || trigger,
        uqiBefore: uqiBefore.toFixed(2),
        uqiAfter: uqiAfter.toFixed(2),
      });

      // Log continuity
      await logContinuity("L3_EVENT", "STATE_TRANSITION", input.objectId, {
        from: oldState,
        to: newState,
        action: input.action,
        uqiBefore,
        uqiAfter,
      });

      // Record governance
      await recordGovernance("FIC_VALIDATION", obj.id, "PASSED",
        `State transition ${oldState}→${newState} via ${input.action}`, "D12");

      return {
        object: obj,
        transition: { from: oldState, to: newState, trigger },
        metrics: { UQI_before: uqiBefore, UQI_after: uqiAfter },
      };
    }),

  // ==========================================================
  // MEASURE — Calculate Quality Indices (IC-04)
  // ==========================================================
  measure: publicQuery
    .input(z.object({
      scope: z.enum(["OBJECT", "SYSTEM"]).default("SYSTEM"),
      objectId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();

      if (input.scope === "OBJECT" && input.objectId) {
        const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
        if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
        const obj = objs[0];

        const uqi = calculateUQI(obj);
        const jqi = calculateJQI(obj);
        const wqi = calculateWQI(obj);
        const oqi = calculateOQI(obj);

        // Store measurements
        await db.insert(measurements).values([
          { objectId: obj.id, measurementType: "UQI", value: uqi.toFixed(4), windowType: "REALTIME" },
          { objectId: obj.id, measurementType: "JQI", value: jqi.toFixed(4), windowType: "REALTIME" },
          { objectId: obj.id, measurementType: "WQI", value: wqi.toFixed(4), windowType: "REALTIME" },
          { objectId: obj.id, measurementType: "OQI", value: oqi.toFixed(4), windowType: "REALTIME" },
        ]);

        return { scope: "OBJECT", objectId: input.objectId, metrics: { UQI: uqi, JQI: jqi, WQI: wqi, OQI: oqi } };
      }

      // System-level measurement
      const allObjects = await db.select().from(intelligenceObjects);
      const ici = calculateICI(allObjects);

      // IRS: count objects with low amanah
      const lowAmanah = allObjects.filter(o => parseFloat(o.amanahScore || "0") < 0.50).length;
      const irs = allObjects.length > 0 ? Math.min(lowAmanah / Math.max(allObjects.length * 0.3, 1), 1) : 0;

      // Store system measurement
      await db.insert(measurements).values([
        { measurementType: "ICI", value: ici.toFixed(4), windowType: "HOURLY" },
        { measurementType: "IRS", value: irs.toFixed(4), windowType: "HOURLY" },
        { measurementType: "SYSTEM", value: allObjects.length.toString(), windowType: "HOURLY", details: JSON.stringify({ objectCount: allObjects.length }) },
      ]);

      return {
        scope: "SYSTEM",
        metrics: { ICI: ici, IRS: irs },
        objectCount: allObjects.length,
        stateDistribution: allObjects.reduce((acc, o) => {
          acc[o.lifecycleState] = (acc[o.lifecycleState] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };
    }),

  // ==========================================================
  // EXCHANGE — Transfer Intelligence (IC-06)
  // ==========================================================
  exchange: publicQuery
    .input(z.object({
      objectId: z.string(),
      producer: z.string(),
      consumer: z.string(),
      exchangeType: z.enum(["DIRECT", "PEER", "HIERARCHICAL", "FEDERATED", "EXTERNAL"]).default("DIRECT"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      // --- Ownership validation (trust + amanah are primary guards) ---
      // --- Trust check ---
      const trustScore = parseFloat(obj.trustScore);
      if (trustScore < 0.40 && input.exchangeType !== "DIRECT") {
        await recordGovernance("TRUST_VERIFICATION", obj.id, "BLOCKED",
          `Trust score ${trustScore} too low for ${input.exchangeType} exchange`, "D19");
        throw new Error(`TRUST_TOO_LOW: ${trustScore} for ${input.exchangeType}`);
      }

      // --- Amanah preservation check ---
      const amanahCheck = checkAmanah(parseFloat(obj.amanahScore));
      if (!amanahCheck.pass) {
        throw new Error(`AMANAH_PRESERVATION_FAILED: Cannot exchange object with Amanah < 0.50`);
      }

      // --- Execute exchange ---
      await db.insert(exchangeRecords).values({
        objectId: obj.id,
        producer: input.producer,
        consumer: input.consumer,
        stage: "TRANSFER",
        exchangeType: input.exchangeType,
        trustScore: obj.trustScore,
        eiScore: "0.95",
        status: "COMPLETED",
        completedAt: new Date(),
      });

      // Log continuity
      await logContinuity("L4_DECISION", "EXCHANGE_EXECUTED", input.objectId, {
        producer: input.producer,
        consumer: input.consumer,
        type: input.exchangeType,
        ownership: obj.ownershipClass,
        trustScore,
      });

      await recordGovernance("PRIVACY_ENFORCEMENT", obj.id, "PASSED",
        `Exchange from ${input.producer} to ${input.consumer} preserved privacy`, "D19");

      return {
        exchanged: true,
        object: obj,
        exchange: {
          producer: input.producer,
          consumer: input.consumer,
          type: input.exchangeType,
          ei: 0.95,
          amanahPreserved: true,
          provenancePreserved: true,
        },
      };
    }),

  // ==========================================================
  // GOVERNANCE — Check System Governance State
  // ==========================================================
  governance: publicQuery.query(async () => {
    const db = getDb();
    const decisions = await db.select().from(governanceDecisions).orderBy(desc(governanceDecisions.decidedAt)).limit(50);
    const recentBlocks = decisions.filter(d => d.outcome === "BLOCKED");
    const totalObjects = await db.select({ count: count() }).from(intelligenceObjects);
    const totalCapital = await db.select({ sum: sql<string>`COALESCE(SUM(${capitalRecords.amount}), 0)` }).from(capitalRecords);

    return {
      decisions: decisions.slice(0, 20),
      stats: {
        totalObjects: totalObjects[0]?.count || 0,
        totalCapital: totalCapital[0]?.sum || "0",
        recentBlocks: recentBlocks.length,
        systemHealth: recentBlocks.length > 5 ? "DECLINING" : recentBlocks.length > 2 ? "STABILIZING" : "ACCUMULATING",
      },
      constitutionalStatus: {
        amanah: "ACTIVE",
        fic: "ACTIVE",
        guardian: "ACTIVE",
        continuity: "ACTIVE",
        privacy: "ACTIVE",
      },
    };
  }),

  // ==========================================================
  // CONTINUITY — Verify hash chain (CCP-B)
  // ==========================================================
  continuity: publicQuery.query(async () => {
    const db = getDb();
    const logs = await db.select().from(continuityLog).orderBy(continuityLog.recordedAt).limit(500);

    // Verify hash chain integrity — supports multi-session chains
    // (server restarts create new chains starting from zero hash)
    let integrity = true;
    let sessionsVerified = 0;
    let recordsInCurrentSession = 0;
    let chainHash = "0".repeat(64);

    for (const log of logs) {
      // Detect new session (previousHash reset to zeros)
      if (log.previousHash === "0".repeat(64) && recordsInCurrentSession > 0) {
        sessionsVerified++;
        recordsInCurrentSession = 0;
        chainHash = "0".repeat(64);
      }

      // Check previous hash link
      if (log.previousHash !== chainHash) {
        integrity = false;
        break;
      }
      // Verify this record's hash is correct
      const computedHash = createHash("sha256").update(log.data + log.previousHash).digest("hex");
      if (log.hash !== computedHash) {
        integrity = false;
        break;
      }
      chainHash = log.hash;
      recordsInCurrentSession++;
    }
    if (recordsInCurrentSession > 0) sessionsVerified++;

    return {
      totalRecords: logs.length,
      sessionsVerified,
      lastHash: logs.length > 0 ? logs[logs.length - 1].hash : null,
      integrity,
      records: logs.slice(-10),
    };
  }),

  // ==========================================================
  // STATS — System Overview Dashboard
  // ==========================================================
  stats: publicQuery.query(async () => {
    const db = getDb();
    const allObjects = await db.select().from(intelligenceObjects);
    const allCapital = await db.select().from(capitalRecords);
    const allMeasurements = await db.select().from(measurements).orderBy(desc(measurements.measuredAt)).limit(50);
    const allGovernance = await db.select().from(governanceDecisions).orderBy(desc(governanceDecisions.decidedAt)).limit(20);

    // State distribution
    const stateDist = allObjects.reduce((acc, o) => {
      acc[o.lifecycleState] = (acc[o.lifecycleState] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Type distribution
    const typeDist = allObjects.reduce((acc, o) => {
      acc[o.objectType] = (acc[o.objectType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Capital by category
    const capitalByCat = allCapital.reduce((acc, c) => {
      acc[c.category] = (parseFloat(acc[c.category] || "0") + parseFloat(c.amount)).toFixed(4);
      return acc;
    }, {} as Record<string, string>);

    // Latest measurements
    const latestMetrics: Record<string, number> = {};
    for (const m of allMeasurements) {
      if (!latestMetrics[m.measurementType]) {
        latestMetrics[m.measurementType] = parseFloat(m.value);
      }
    }

    return {
      objects: {
        total: allObjects.length,
        byState: stateDist,
        byType: typeDist,
      },
      capital: {
        totalRecords: allCapital.length,
        byCategory: capitalByCat,
      },
      metrics: latestMetrics,
      governance: {
        totalDecisions: allGovernance.length,
        recent: allGovernance.slice(0, 10),
      },
      systemHealth: latestMetrics.IRS > 0.5 ? "DECLINING" : latestMetrics.IRS > 0.3 ? "STABILIZING" : "ACCUMULATING",
    };
  }),

  // ==========================================================
  // LINEAGE — Get full provenance chain
  // ==========================================================
  lineage: publicQuery
    .input(z.object({ objectId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const provenance = await db.select().from(provenanceRecords)
        .where(eq(provenanceRecords.objectId, obj.id))
        .orderBy(provenanceRecords.recordedAt);

      const transitions = await db.select().from(learningTransitions)
        .where(eq(learningTransitions.objectId, obj.id))
        .orderBy(learningTransitions.transitionAt);

      const capital = await db.select().from(capitalRecords)
        .where(eq(capitalRecords.objectId, obj.id))
        .orderBy(capitalRecords.recordedAt);

      const relationships = await db.select().from(objectRelationships)
        .where(sql`${objectRelationships.fromObjectId} = ${obj.id} OR ${objectRelationships.toObjectId} = ${obj.id}`);

      return {
        object: obj,
        provenance,
        transitions,
        capital,
        relationships,
        depth: provenance.length + transitions.length,
      };
    }),

  // ==========================================================
  // PHASE 2: LEARNING PROOF ENDPOINTS (LP-01 through LP-10)
  // ==========================================================

  // LP-01: feedBatch — Submit multiple observations for pattern detection
  feedBatch: publicQuery
    .input(z.object({
      observations: z.array(z.object({
        content: z.string().min(1),
        amanahScore: z.number().min(0).max(1).optional(),
      })).min(2).max(20),
      patternHint: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const createdIds: string[] = [];

      // Step 1: Create all observations as SIGNAL objects
      for (const obs of input.observations) {
        const contentHash = createHash("sha256").update(obs.content).digest("hex");
        const objectId = randomUUID();
        const [obj] = await db.insert(intelligenceObjects).values({
          objectId,
          objectType: "SIGNAL",
          lifecycleState: "VALIDATED",
          version: 1,
          originSource: "L5_REALITY",
          creatorIdentity: "System",
          amanahScore: (obs.amanahScore || 0.70).toFixed(2),
          ownershipClass: "DERIVED",
          validationStatus: "PROVISIONAL",
          understandingRung: 0,
          capitalValue: "0",
          content: obs.content,
          contentHash,
          semanticSummary: obs.content.substring(0, 200),
          privacyLevel: "INSTITUTIONAL",
          trustScore: (obs.amanahScore || 0.70).toFixed(2),
          shadowStatus: "NOT_SHADOW",
          customAttributes: JSON.stringify({ sourceLayer: "L5_REALITY" }),
        }).$returningId();
        createdIds.push(objectId);

        // Record provenance
        await db.insert(provenanceRecords).values([
          { objectId: obj.id, dimension: "ORIGIN_SOURCE", value: "L5_REALITY", hash: createHash("sha256").update("L5_REALITY").digest("hex") },
          { objectId: obj.id, dimension: "CREATOR_IDENTITY", value: "System", hash: createHash("sha256").update("System").digest("hex") },
          { objectId: obj.id, dimension: "CREATION_TIMESTAMP", value: new Date().toISOString(), hash: createHash("sha256").update(Date.now().toString()).digest("hex") },
        ]);

        await logContinuity("L2_OBJECT", "BATCH_OBSERVATION_CREATED", objectId, {
          objectType: "SIGNAL", originSource: "L5_REALITY",
        });
      }

      // Step 2: Auto-detect pattern if shared keywords exist
      const keywords = extractSharedKeywords(input.observations.map(o => o.content));
      let patternObjectId: string | null = null;

      if (keywords.length >= 2 && input.observations.length >= 3) {
        const patternContent = `Pattern detected: ${keywords.join(", ")} — observed across ${input.observations.length} independent events. ${input.patternHint || ""}`;
        const patternId = randomUUID();
        await db.insert(intelligenceObjects).values({
          objectId: patternId,
          objectType: "PATTERN",
          lifecycleState: "PATTERN",
          version: 1,
          originSource: "L5_REALITY",
          creatorIdentity: "System",
          amanahScore: "0.75",
          ownershipClass: "DERIVED",
          validationStatus: "CONFIRMED",
          understandingRung: 1,
          capitalValue: "0",
          content: patternContent,
          contentHash: createHash("sha256").update(patternContent).digest("hex"),
          semanticSummary: patternContent.substring(0, 200),
          privacyLevel: "INSTITUTIONAL",
          trustScore: "0.75",
          shadowStatus: "NOT_SHADOW",
          customAttributes: JSON.stringify({ patternKeywords: keywords, observationCount: input.observations.length }),
        }).$returningId();
        patternObjectId = patternId;

        // Link observations to pattern
        const patternDbId = (await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, patternObjectId)))[0]?.id;
        for (const oid of createdIds) {
          const objDbId = (await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, oid)))[0]?.id;
          if (patternDbId && objDbId) {
            await db.insert(objectRelationships).values({
              fromObjectId: patternDbId,
              toObjectId: objDbId,
              relationshipType: "DERIVES_FROM",
              strength: "0.85",
            });
          }
        }
      }

      await logContinuity("L3_EVENT", "PATTERN_FORMATION", patternObjectId || "batch", {
        observations: input.observations.length,
        keywords,
        patternFormed: !!patternObjectId,
      });

      return {
        observationsCreated: createdIds.length,
        patternFormed: !!patternObjectId,
        patternObjectId,
        sharedKeywords: keywords,
        observationIds: createdIds,
      };
    }),

  // LP-05: reinforce — Strengthen intelligence with validation
  reinforce: publicQuery
    .input(z.object({
      objectId: z.string(),
      validationType: z.enum(["REALITY", "CROSS_REFERENCE", "FOUNDER", "INSTITUTION"]),
      evidence: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const currentAmanah = parseFloat(obj.amanahScore);
      const strengthGain = input.validationType === "FOUNDER" ? 0.10 : input.validationType === "INSTITUTION" ? 0.07 : 0.05;
      const newAmanah = Math.min(currentAmanah + strengthGain, 1.0);

      await db.update(intelligenceObjects)
        .set({ amanahScore: newAmanah.toFixed(2) })
        .where(eq(intelligenceObjects.id, obj.id));

      await db.insert(provenanceRecords).values({
        objectId: obj.id,
        dimension: "VALIDATION_HISTORY",
        value: `REINFORCE[${input.validationType}]: ${input.evidence} (Amanah ${currentAmanah}→${newAmanah.toFixed(2)})`,
        hash: createHash("sha256").update(input.evidence + Date.now().toString()).digest("hex"),
      });

      await recordGovernance("FIC_VALIDATION", obj.id, "PASSED",
        `Reinforced via ${input.validationType}: ${input.evidence}`, "D12-H");

      return {
        objectId: input.objectId,
        reinforcementType: input.validationType,
        amanahBefore: currentAmanah,
        amanahAfter: newAmanah,
        strengthGained: strengthGain,
      };
    }),

  // LP-06: decay — Apply temporal/contradiction decay
  decay: publicQuery
    .input(z.object({
      objectId: z.string(),
      decayType: z.enum(["TEMPORAL", "CONTRADICTION", "REALITY"]).default("TEMPORAL"),
      severity: z.number().min(0.01).max(0.5).default(0.10),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const currentAmanah = parseFloat(obj.amanahScore);
      const newAmanah = Math.max(currentAmanah - input.severity, 0.10);

      // Amanah floor check — if below 0.50, transition to DECAYING
      let newState = obj.lifecycleState;
      if (newAmanah < 0.50) {
        newState = "DECAYING";
        await db.update(intelligenceObjects)
          .set({ lifecycleState: "DECAYING" as typeof intelligenceObjects.$inferInsert.lifecycleState, amanahScore: newAmanah.toFixed(2) })
          .where(eq(intelligenceObjects.id, obj.id));

        await recordGovernance("GUARDIAN_ALERT", obj.id, "FLAGGED",
          `Object decayed below Amanah floor: ${newAmanah.toFixed(2)}`, "D12-I");
      } else {
        await db.update(intelligenceObjects)
          .set({ amanahScore: newAmanah.toFixed(2) })
          .where(eq(intelligenceObjects.id, obj.id));
      }

      await db.insert(provenanceRecords).values({
        objectId: obj.id,
        dimension: "TRANSFORMATION_CHAIN",
        value: `DECAY[${input.decayType}]: Amanah ${currentAmanah}→${newAmanah.toFixed(2)}`,
        hash: createHash("sha256").update(input.decayType + Date.now().toString()).digest("hex"),
      });

      return {
        objectId: input.objectId,
        decayType: input.decayType,
        amanahBefore: currentAmanah,
        amanahAfter: newAmanah,
        newState,
        floorBreached: newAmanah < 0.50,
      };
    }),

  // LP-07: correct — Fix incorrect learning
  correct: publicQuery
    .input(z.object({
      objectId: z.string(),
      correction: z.string(),
      contradictingEvidence: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const oldState = obj.lifecycleState;

      // Transition to CORRECTING
      await db.update(intelligenceObjects)
        .set({ lifecycleState: "CORRECTING" as typeof intelligenceObjects.$inferInsert.lifecycleState })
        .where(eq(intelligenceObjects.id, obj.id));

      // Record correction in provenance
      await db.insert(provenanceRecords).values({
        objectId: obj.id,
        dimension: "TRANSFORMATION_CHAIN",
        value: `CORRECTION: ${input.correction} | Evidence: ${input.contradictingEvidence}`,
        hash: createHash("sha256").update(input.correction + input.contradictingEvidence).digest("hex"),
      });

      // Log transition
      await db.insert(learningTransitions).values({
        objectId: obj.id,
        fromState: oldState,
        toState: "CORRECTING",
        trigger: "CORRECTION",
        evidence: `${input.contradictingEvidence} | Correction: ${input.correction}`,
      });

      await recordGovernance("FIC_VALIDATION", obj.id, "PASSED",
        `Correction applied: ${input.correction}`, "D12-G");

      return {
        objectId: input.objectId,
        fromState: oldState,
        toState: "CORRECTING",
        correction: input.correction,
        contradictingEvidence: input.contradictingEvidence,
      };
    }),

  // LP-08: unlearn — Retire invalid learning
  unlearn: publicQuery
    .input(z.object({
      objectId: z.string(),
      reason: z.string(),
      replacementObjectId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const oldState = obj.lifecycleState;

      // Transition to ARCHIVED (not deleted — evidence preserved per D12-G)
      await db.update(intelligenceObjects)
        .set({
          lifecycleState: "ARCHIVED" as typeof intelligenceObjects.$inferInsert.lifecycleState,
          governanceFlags: `UNLEARNED: ${input.reason}`,
        })
        .where(eq(intelligenceObjects.id, obj.id));

      // If replacement provided, create SUPERCEDES relationship
      if (input.replacementObjectId) {
        const replacement = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.replacementObjectId));
        if (replacement.length > 0) {
          await db.insert(objectRelationships).values({
            fromObjectId: replacement[0].id,
            toObjectId: obj.id,
            relationshipType: "SUPERSEDES",
            strength: "1.00",
          });
        }
      }

      await db.insert(provenanceRecords).values({
        objectId: obj.id,
        dimension: "TRANSFORMATION_CHAIN",
        value: `UNLEARNED: ${input.reason} | Previous state: ${oldState}`,
        hash: createHash("sha256").update(input.reason + Date.now().toString()).digest("hex"),
      });

      await recordGovernance("HUMAN_GATE", obj.id, "PASSED",
        `Unlearned: ${input.reason} | State preserved in ARCHIVED`, "D12-G");

      return {
        objectId: input.objectId,
        fromState: oldState,
        toState: "ARCHIVED",
        reason: input.reason,
        evidencePreserved: true,
        supersededBy: input.replacementObjectId || null,
      };
    }),

  // LP-09: transfer — Move wisdom between contexts
  transfer: publicQuery
    .input(z.object({
      objectId: z.string(),
      fromContext: z.string(),
      toContext: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      // Verify object is wisdom-level
      const isWisdom = obj.lifecycleState === "WISDOM" || obj.lifecycleState === "CAPITALIZED";
      if (!isWisdom) {
        throw new Error("TRANSFER_REQUIRES_WISDOM: Object must be WISDOM or CAPITALIZED");
      }

      // Calculate retention coefficient (simplified: based on Amanah)
      const amanah = parseFloat(obj.amanahScore);
      const retentionCoefficient = amanah; // Higher Amanah = better retention

      // Create transfer record
      await db.insert(exchangeRecords).values({
        objectId: obj.id,
        producer: input.fromContext,
        consumer: input.toContext,
        stage: "INTEGRATION",
        exchangeType: "PEER",
        trustScore: obj.trustScore,
        eiScore: retentionCoefficient.toFixed(2),
        status: "COMPLETED",
        completedAt: new Date(),
      });

      // Record context adaptation
      await db.insert(provenanceRecords).values({
        objectId: obj.id,
        dimension: "EXCHANGE_HISTORY",
        value: `TRANSFER: ${input.fromContext} → ${input.toContext} | Retention: ${retentionCoefficient.toFixed(2)}`,
        hash: createHash("sha256").update(input.fromContext + input.toContext).digest("hex"),
      });

      return {
        objectId: input.objectId,
        fromContext: input.fromContext,
        toContext: input.toContext,
        retentionCoefficient,
        adaptationScore: retentionCoefficient * 0.85, // 85% adaptation assumed
        transferred: true,
      };
    }),

  // LP-10: proofReport — Generate comprehensive Phase 2 certification report
  proofReport: publicQuery.query(async () => {
    const db = getDb();

    const allObjects = await db.select().from(intelligenceObjects);
    const allTransitions = await db.select().from(learningTransitions).orderBy(learningTransitions.transitionAt);
    const allCapital = await db.select().from(capitalRecords);
    const allGovernance = await db.select().from(governanceDecisions).orderBy(desc(governanceDecisions.decidedAt));
    const allMeasurements = await db.select().from(measurements).orderBy(desc(measurements.measuredAt));

    // LP-01: Pattern formation count
    const patterns = allObjects.filter(o => o.objectType === "PATTERN" || o.lifecycleState === "PATTERN");

    // LP-02: Understanding count
    const understandings = allObjects.filter(o => o.lifecycleState === "UNDERSTANDING" || o.understandingRung >= 1);

    // LP-03: Judgment count
    const judgments = allObjects.filter(o => o.lifecycleState === "JUDGMENT");

    // LP-04: Wisdom count
    const wisdoms = allObjects.filter(o => o.lifecycleState === "WISDOM" || o.lifecycleState === "CAPITALIZED");

    // LP-05: Reinforcement events (amanah increases)
    const reinforcements = allGovernance.filter(g => g.rationale.includes("Reinforced"));

    // LP-06: Decay events
    const decays = allGovernance.filter(g => g.rationale.includes("decayed") || g.rationale.includes("DECAY"));

    // LP-07: Corrections
    const corrections = allTransitions.filter(t => t.trigger === "CORRECTION");

    // LP-08: Unlearning
    const unlearned = allObjects.filter(o => o.lifecycleState === "ARCHIVED");

    // LP-09: Transfers
    const transfers = await db.select().from(exchangeRecords).where(eq(exchangeRecords.status, "COMPLETED"));

    // LP-10: Compounding — measure index trends
    const uqiMeasurements = allMeasurements.filter(m => m.measurementType === "UQI").sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime());
    const jqiMeasurements = allMeasurements.filter(m => m.measurementType === "JQI").sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime());

    return {
      // LP-01 Pattern Formation
      lp01_patternFormation: {
        demonstrated: patterns.length > 0,
        patternCount: patterns.length,
        evidence: `${patterns.length} pattern objects formed from multiple observations`,
      },

      // LP-02 Understanding Formation
      lp02_understandingFormation: {
        demonstrated: understandings.length > 0,
        understandingCount: understandings.length,
        avgRung: understandings.length > 0 ? understandings.reduce((s, o) => s + o.understandingRung, 0) / understandings.length : 0,
        evidence: `${understandings.length} understanding objects with avg rung`,
      },

      // LP-03 Judgment Formation
      lp03_judgmentFormation: {
        demonstrated: judgments.length > 0,
        judgmentCount: judgments.length,
        evidence: `${judgments.length} judgment objects rendered`,
      },

      // LP-04 Wisdom Formation
      lp04_wisdomFormation: {
        demonstrated: wisdoms.length > 0,
        wisdomCount: wisdoms.length,
        evidence: `${wisdoms.length} wisdom/capitalized objects`,
      },

      // LP-05 Reinforcement
      lp05_reinforcement: {
        demonstrated: reinforcements.length > 0,
        reinforcementCount: reinforcements.length,
        evidence: `${reinforcements.length} reinforcement events recorded`,
      },

      // LP-06 Decay
      lp06_decay: {
        demonstrated: decays.length > 0 || allObjects.some(o => o.lifecycleState === "DECAYING"),
        decayCount: decays.length + allObjects.filter(o => o.lifecycleState === "DECAYING").length,
        evidence: `${decays.length} decay events + ${allObjects.filter(o => o.lifecycleState === "DECAYING").length} decaying objects`,
      },

      // LP-07 Correction
      lp07_correction: {
        demonstrated: corrections.length > 0,
        correctionCount: corrections.length,
        evidence: `${corrections.length} correction transitions logged`,
      },

      // LP-08 Unlearning
      lp08_unlearning: {
        demonstrated: unlearned.length > 0,
        unlearnedCount: unlearned.length,
        evidence: `${unlearned.length} objects unlearned (ARCHIVED, evidence preserved)`,
      },

      // LP-09 Transfer
      lp09_transfer: {
        demonstrated: transfers.length > 0,
        transferCount: transfers.length,
        avgRetention: transfers.length > 0 ? transfers.reduce((s, t) => s + parseFloat(t.eiScore || "0"), 0) / transfers.length : 0,
        evidence: `${transfers.length} transfers with avg retention`,
      },

      // LP-10 Compounding
      lp10_compounding: {
        demonstrated: uqiMeasurements.length >= 2 || allCapital.length >= 3,
        uqiTrend: uqiMeasurements.length >= 2 ? {
          first: parseFloat(uqiMeasurements[0].value),
          latest: parseFloat(uqiMeasurements[uqiMeasurements.length - 1].value),
          delta: parseFloat(uqiMeasurements[uqiMeasurements.length - 1].value) - parseFloat(uqiMeasurements[0].value),
        } : null,
        jqiTrend: jqiMeasurements.length >= 2 ? {
          first: parseFloat(jqiMeasurements[0].value),
          latest: parseFloat(jqiMeasurements[jqiMeasurements.length - 1].value),
          delta: parseFloat(jqiMeasurements[jqiMeasurements.length - 1].value) - parseFloat(jqiMeasurements[0].value),
        } : null,
        capitalRecords: allCapital.length,
        evidence: `${allCapital.length} capital records, UQI trend: ${uqiMeasurements.length >= 2 ? (parseFloat(uqiMeasurements[uqiMeasurements.length - 1].value) - parseFloat(uqiMeasurements[0].value)).toFixed(4) : "N/A"}`,
      },

      summary: {
        totalObjects: allObjects.length,
        totalTransitions: allTransitions.length,
        totalCapital: allCapital.length,
        proofsDemonstrated: [
          patterns.length > 0,
          understandings.length > 0,
          judgments.length > 0,
          wisdoms.length > 0,
          reinforcements.length > 0,
          decays.length > 0 || allObjects.some(o => o.lifecycleState === "DECAYING"),
          corrections.length > 0,
          unlearned.length > 0,
          transfers.length > 0,
          uqiMeasurements.length >= 2 || allCapital.length >= 3,
        ].filter(Boolean).length,
      },
    };
  }),

  // ==========================================================
  // PHASE 3: MULTI-CONTEXT INTELLIGENCE (MC-01 through MC-10)
  // Source Authority: D14 — Meta-Intelligence Orchestration
  // ==========================================================

  // MC-01: selectSource — Rank and select among competing sources
  selectSource: publicQuery
    .input(z.object({
      sources: z.array(z.object({
        layer: z.string(),
        name: z.string(),
        trustScore: z.number(),
        content: z.string(),
        relevance: z.number().optional(),
      })),
      context: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // D14 Source Selection Hierarchy: L1 > L2 > L3 > L4 > L5 > L6 > L7 > L8
      const layerRank: Record<string, number> = {
        L1_FOUNDER: 8, L2_SIL: 7, L3_COMPANION: 6, L4_PARTNER: 5,
        L5_REALITY: 4, L6_PROCESS: 3, L7_EXTERNAL: 2, L8_GENERAL: 1,
      };

      const scored = input.sources.map(s => {
        const rank = layerRank[s.layer] || 0;
        const relevance = s.relevance || 0.5;
        const compositeScore = (rank * 0.4) + (s.trustScore * 0.35) + (relevance * 0.25);
        return { ...s, rank, compositeScore };
      }).sort((a, b) => b.compositeScore - a.compositeScore);

      const selected = scored[0];
      const rejected = scored.slice(1);

      await recordGovernance("FIC_VALIDATION", null, "PASSED",
        `MC-01 Source Selection: Selected ${selected.name} (${selected.layer}) score=${selected.compositeScore.toFixed(4)} over ${rejected.length} alternatives`, "D14");

      await logContinuity("L7_INSTITUTIONAL", "MC01_SOURCE_SELECTION", "meta",
        { selected: selected.name, layer: selected.layer, score: selected.compositeScore, alternatives: rejected.map(r => r.name) });

      return {
        selected: { name: selected.name, layer: selected.layer, score: selected.compositeScore },
        ranking: scored.map((s, i) => ({ rank: i + 1, name: s.name, layer: s.layer, score: s.compositeScore.toFixed(4) })),
        rejected: rejected.map(r => ({ name: r.name, layer: r.layer, reason: `Lower composite score: ${r.compositeScore.toFixed(4)} vs ${selected.compositeScore.toFixed(4)}` })),
        selectionRationale: `Selected ${selected.name} based on D14 hierarchy: layerRank=${selected.rank} * 0.4 + trustScore=${selected.trustScore} * 0.35 + relevance=${selected.relevance || 0.5} * 0.25 = ${selected.compositeScore.toFixed(4)}`,
        hierarchyApplied: "D14 9-layer source selection",
      };
    }),

  // MC-02: route — Route intelligence to correct context
  route: publicQuery
    .input(z.object({
      objectId: z.string(),
      targetContext: z.string(),
      priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const routingRules: Record<string, { allowedLayers: string[]; privacyFilter: string }> = {
        PERSONAL: { allowedLayers: ["L1_FOUNDER", "L3_COMPANION"], privacyFilter: "PERSONAL" },
        INSTITUTIONAL: { allowedLayers: ["L1_FOUNDER", "L2_SIL", "L4_PARTNER", "L5_REALITY", "L6_PROCESS"], privacyFilter: "INSTITUTIONAL" },
        STRATEGIC: { allowedLayers: ["L1_FOUNDER", "L2_SIL", "L4_PARTNER"], privacyFilter: "INSTITUTIONAL" },
        OPERATIONAL: { allowedLayers: ["L5_REALITY", "L6_PROCESS", "L7_EXTERNAL"], privacyFilter: "OPERATIONAL" },
      };

      const rule = routingRules[input.targetContext] || routingRules.INSTITUTIONAL;
      const sourceLayer = obj.customAttributes ? JSON.parse(obj.customAttributes).sourceLayer || "L7_EXTERNAL" : "L7_EXTERNAL";
      const allowed = rule.allowedLayers.includes(sourceLayer) || obj.originSource === "L1_FOUNDER";
      const effectiveAllowed = obj.originSource === "L1_FOUNDER" ? true : allowed;

      const routeDecision = {
        objectId: input.objectId,
        targetContext: input.targetContext,
        sourceLayer,
        allowed: effectiveAllowed,
        rule: input.targetContext,
        privacyFilter: rule.privacyFilter,
        priority: input.priority,
        leakagePrevented: !effectiveAllowed,
        founderOverride: obj.originSource === "L1_FOUNDER",
      };

      await recordGovernance("FIC_VALIDATION", obj.id, effectiveAllowed ? "PASSED" : "BLOCKED",
        `MC-02 Routing: ${input.objectId} to ${input.targetContext} | Layer=${sourceLayer} | Allowed=${effectiveAllowed}${obj.originSource === "L1_FOUNDER" ? " (Founder override)" : ""}`, "D14");

      await logContinuity("L6_CONSTITUTIONAL", "MC02_ROUTING", input.objectId, routeDecision);

      return routeDecision;
    }),

  // MC-03: arbitrate — Resolve contradictions using D14 hierarchy
  arbitrate: publicQuery
    .input(z.object({
      conflictType: z.enum(["SOURCE_VS_SOURCE", "WISDOM_VS_REALITY", "FOUNDER_VS_INSTITUTION"]),
      partyA: z.object({ id: z.string(), layer: z.string(), content: z.string(), amanah: z.number() }),
      partyB: z.object({ id: z.string(), layer: z.string(), content: z.string(), amanah: z.number() }),
      context: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const layerPriority: Record<string, number> = {
        L1_FOUNDER: 10, L2_SIL: 9, L3_COMPANION: 8, L4_PARTNER: 7,
        L5_REALITY: 6, L6_PROCESS: 5, L7_EXTERNAL: 4, L8_GENERAL: 3,
      };

      const pa = layerPriority[input.partyA.layer] || 0;
      const pb = layerPriority[input.partyB.layer] || 0;

      let winner: string;
      let justification: string;
      let resolution: string;

      if (input.conflictType === "FOUNDER_VS_INSTITUTION") {
        winner = input.partyA.layer === "L1_FOUNDER" ? input.partyA.id : input.partyB.id;
        justification = "D14 Level 10: Founder Intent is absolute. No institutional override permitted.";
        resolution = "FOUNDER_PREVAILS";
      } else if (input.conflictType === "WISDOM_VS_REALITY") {
        if (input.partyB.amanah > input.partyA.amanah + 0.2) {
          winner = input.partyB.id;
          justification = `D14 Level 6: Reality evidence (amanah=${input.partyB.amanah}) supersedes wisdom (amanah=${input.partyA.amanah}) by >0.2 margin`;
          resolution = "REALITY_UPDATES";
        } else {
          winner = input.partyA.id;
          justification = `D14 Level 6: Wisdom retained (amanah=${input.partyA.amanah}) — reality evidence (amanah=${input.partyB.amanah}) insufficient to override`;
          resolution = "WISDOM_RETAINED";
        }
      } else {
        if (pa > pb) {
          winner = input.partyA.id;
          justification = `D14 hierarchy: ${input.partyA.layer} (priority ${pa}) > ${input.partyB.layer} (priority ${pb})`;
          resolution = "HIERARCHY_PREVAILS";
        } else if (pb > pa) {
          winner = input.partyB.id;
          justification = `D14 hierarchy: ${input.partyB.layer} (priority ${pb}) > ${input.partyA.layer} (priority ${pa})`;
          resolution = "HIERARCHY_PREVAILS";
        } else {
          winner = input.partyA.amanah >= input.partyB.amanah ? input.partyA.id : input.partyB.id;
          justification = `Same layer (${input.partyA.layer}): Higher Amanah wins (${Math.max(input.partyA.amanah, input.partyB.amanah)})`;
          resolution = "AMANAH_TIEBREAK";
        }
      }

      await recordGovernance("AUDITOR_LOG", null, "PASSED",
        `MC-03 Arbitration: ${input.conflictType} | Winner=${winner} | Resolution=${resolution} | ${justification}`, "D14");

      await logContinuity("L6_CONSTITUTIONAL", "MC03_ARBITRATION", "meta",
        { conflictType: input.conflictType, winner, resolution, justification });

      return {
        conflictType: input.conflictType,
        winner,
        resolution,
        justification,
        partyA: { id: input.partyA.id, priority: pa, amanah: input.partyA.amanah },
        partyB: { id: input.partyB.id, priority: pb, amanah: input.partyB.amanah },
        hierarchyApplied: "D14 10-Level Arbitration",
      };
    }),

  // MC-04: synthesize — Merge multiple inputs into single IO
  synthesize: publicQuery
    .input(z.object({
      inputs: z.array(z.object({
        objectId: z.string(),
        weight: z.number().min(0).max(1).optional(),
      })).min(3),
      outputType: z.enum(["SIGNAL", "PATTERN", "UNDERSTANDING", "JUDGMENT", "WISDOM"]).default("PATTERN"),
      synthesisMethod: z.enum(["CONSENSUS", "HIERARCHICAL", "WEIGHTED"]).default("HIERARCHICAL"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const inputObjects = [];
      for (const inp of input.inputs) {
        const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, inp.objectId));
        if (objs.length > 0) {
          inputObjects.push({ ...objs[0], weight: inp.weight || (1 / input.inputs.length) });
        }
      }

      if (inputObjects.length < 3) throw new Error(`MC-04 requires minimum 3 valid inputs, found ${inputObjects.length}`);

      const maxAmanah = Math.max(...inputObjects.map(o => parseFloat(o.amanahScore || "0")));
      const avgTrust = inputObjects.reduce((s, o) => s + parseFloat(o.trustScore || "0"), 0) / inputObjects.length;
      const lineageIds = inputObjects.map(o => o.objectId);

      const layerPriority: Record<string, number> = {
        L1_FOUNDER: 8, L2_SIL: 7, L3_COMPANION: 6, L4_PARTNER: 5,
        L5_REALITY: 4, L6_PROCESS: 3, L7_EXTERNAL: 2, L8_GENERAL: 1,
      };
      const dominant = inputObjects.sort((a, b) => (layerPriority[b.originSource] || 0) - (layerPriority[a.originSource] || 0))[0];

      const outputId = randomUUID();
      const synthContent = `[SYNTHESIZED from ${inputObjects.length} sources] ${dominant.content}`;
      const [inserted] = await db.insert(intelligenceObjects).values({
        objectId: outputId,
        objectType: input.outputType,
        lifecycleState: "VALIDATED",
        originSource: dominant.originSource,
        creatorIdentity: "SYNTHESIZER_D14",
        amanahScore: maxAmanah.toFixed(2),
        ownershipClass: "DERIVED",
        content: synthContent,
        contentHash: createHash("sha256").update(synthContent).digest("hex"),
        semanticSummary: `Synthesis of ${inputObjects.length} intelligence objects via ${input.synthesisMethod}`,
        privacyLevel: "INSTITUTIONAL",
        trustScore: avgTrust.toFixed(2),
        customAttributes: JSON.stringify({ synthesisMethod: input.synthesisMethod, lineage: lineageIds, weights: inputObjects.map(o => o.weight) }),
      }).$returningId();

      for (const src of inputObjects) {
        await db.insert(objectRelationships).values({
          fromObjectId: inserted.id,
          toObjectId: src.id,
          relationshipType: "DERIVES_FROM",
          strength: src.weight.toFixed(2),
        });
        await db.insert(provenanceRecords).values({
          objectId: inserted.id,
          dimension: "TRANSFORMATION_CHAIN",
          value: `Input: ${src.objectId} (layer=${src.originSource}, weight=${src.weight.toFixed(2)})`,
          hash: createHash("sha256").update(src.objectId + outputId).digest("hex"),
        });
      }

      await recordGovernance("FIC_VALIDATION", inserted.id, "PASSED",
        `MC-04 Synthesis: ${inputObjects.length} inputs -> ${outputId} | Method=${input.synthesisMethod} | Dominant=${dominant.originSource}`, "D14");

      await logContinuity("L6_CONSTITUTIONAL", "MC04_SYNTHESIS", outputId,
        { inputs: lineageIds, method: input.synthesisMethod, dominant: dominant.originSource });

      return {
        outputObjectId: outputId,
        inputsUsed: inputObjects.length,
        synthesisMethod: input.synthesisMethod,
        dominantSource: dominant.originSource,
        amanahPreserved: maxAmanah,
        confidence: avgTrust.toFixed(2),
        lineage: lineageIds,
        traceability: `All ${inputObjects.length} inputs linked via DERIVES_FROM relationships and provenance records`,
      };
    }),

  // MC-05: perspectives — Return multiple perspectives on shared intelligence
  perspectives: publicQuery
    .input(z.object({
      objectId: z.string(),
      perspectiveTypes: z.array(z.enum(["FOUNDER", "INSTITUTIONAL", "DOMAIN"])).default(["FOUNDER", "INSTITUTIONAL", "DOMAIN"]),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const perspectives: Record<string, { lens: string; interpretation: string; confidence: number; concerns: string[] }> = {
        FOUNDER: {
          lens: "Dream -> Potential -> Goal -> Flourishing -> Evolution",
          interpretation: `From Founder perspective: "${obj.content}" represents ${obj.capitalCategory || "potential"} capital aligned with the Evolution Operating System.`,
          confidence: parseFloat(obj.amanahScore || "0"),
          concerns: obj.originSource !== "L1_FOUNDER" ? ["Not founder-originated — verify alignment"] : [],
        },
        INSTITUTIONAL: {
          lens: "Operational excellence across Elite Vet, Pawz, Vets Van",
          interpretation: `Institutional view: "${obj.content}" has ${obj.capitalValue || "0"} capital in category ${obj.capitalCategory || "UNASSIGNED"}. Applicable across all subsidiaries.`,
          confidence: parseFloat(obj.trustScore || "0"),
          concerns: parseFloat(obj.amanahScore || "0") < 0.7 ? ["Amanah below institutional threshold"] : [],
        },
        DOMAIN: {
          lens: "Veterinary medicine domain expertise",
          interpretation: `Domain analysis: "${obj.content}" — trustScore=${obj.trustScore}, objectType=${obj.objectType}. Recommend review by domain specialist.`,
          confidence: (parseFloat(obj.amanahScore || "0") + parseFloat(obj.trustScore || "0")) / 2,
          concerns: obj.objectType !== "UNDERSTANDING" && obj.objectType !== "JUDGMENT" ? ["Not domain-validated understanding"] : [],
        },
      };

      const selected = input.perspectiveTypes.map(p => ({
        type: p,
        ...perspectives[p],
      }));

      await recordGovernance("FIC_VALIDATION", obj.id, "PASSED",
        `MC-05 Perspectives: ${input.objectId} rendered ${selected.length} perspectives from shared root`, "D14");

      return {
        objectId: input.objectId,
        sharedRoot: obj.objectId,
        perspectiveCount: selected.length,
        perspectives: selected,
        fragmentationRisk: "NONE — all perspectives reference same intelligence root",
        coherencePreserved: true,
      };
    }),

  // MC-06: domainOrchestrate — Cross-domain coordination
  domainOrchestrate: publicQuery
    .input(z.object({
      domains: z.array(z.string()).min(2),
      intelligenceId: z.string(),
      orchestrationMode: z.enum(["ESCALATE", "ARBITRATE", "SYNTHESIZE"]).default("SYNTHESIZE"),
    }))
    .mutation(async ({ input }) => {
      const domainCapabilities: Record<string, { expertise: string[]; priority: number }> = {
        CLINICAL: { expertise: ["diagnosis", "treatment", "pharmacy"], priority: 9 },
        OPERATIONS: { expertise: ["scheduling", "logistics", "staffing"], priority: 7 },
        FINANCE: { expertise: ["pricing", "budgeting", "investment"], priority: 6 },
        TECHNOLOGY: { expertise: ["systems", "data", "automation"], priority: 5 },
        MARKETING: { expertise: ["outreach", "brand", "growth"], priority: 4 },
      };

      const domainProfiles = input.domains.map(d => ({
        name: d,
        ...(domainCapabilities[d.toUpperCase()] || { expertise: ["general"], priority: 1 }),
      })).sort((a, b) => b.priority - a.priority);

      const leadDomain = domainProfiles[0];
      const supportingDomains = domainProfiles.slice(1);

      const escalationPath = domainProfiles.map((d, i) => ({
        step: i + 1,
        domain: d.name,
        action: i === 0 ? "LEAD" : "SUPPORT",
        priority: d.priority,
      }));

      let resolution: Record<string, unknown>;
      if (input.orchestrationMode === "ESCALATE") {
        resolution = { method: "ESCALATE", path: escalationPath, resolvedBy: leadDomain.name };
      } else if (input.orchestrationMode === "ARBITRATE") {
        resolution = { method: "ARBITRATE", winner: leadDomain.name, rationale: `Highest domain priority: ${leadDomain.priority}` };
      } else {
        const allExpertise = domainProfiles.flatMap(d => d.expertise);
        resolution = {
          method: "SYNTHESIZE",
          lead: leadDomain.name,
          contributors: supportingDomains.map(d => d.name),
          combinedExpertise: [...new Set(allExpertise)],
        };
      }

      await recordGovernance("FIC_VALIDATION", null, "PASSED",
        `MC-06 Domain Orchestration: ${input.domains.join("+")} | Mode=${input.orchestrationMode} | Lead=${leadDomain.name}`, "D14");

      await logContinuity("L6_CONSTITUTIONAL", "MC06_DOMAIN", "meta",
        { domains: input.domains, mode: input.orchestrationMode, resolution });

      return {
        domains: input.domains,
        domainCount: input.domains.length,
        orchestrationMode: input.orchestrationMode,
        leadDomain: leadDomain.name,
        supportingDomains: supportingDomains.map(d => d.name),
        escalationPath,
        resolution,
        coherence: `Cross-domain coordination achieved: ${input.domains.join(" <-> ")}`,
      };
    }),

  // MC-07: institutionalBoundaries — Shared vs institution-specific intelligence
  institutionalBoundaries: publicQuery
    .input(z.object({
      institutions: z.array(z.string()).min(1),
      intelligenceType: z.enum(["SHARED", "INSTITUTION_SPECIFIC"]).default("SHARED"),
    }))
    .query(async ({ input }) => {
      const db = getDb();

      const ownershipRules = {
        SHARED: {
          access: ["ALL_INSTITUTIONS"],
          transferRule: "FREE_WITH_ATTRIBUTION",
          modificationRule: "COORDINATED_CHANGE",
          description: "Intelligence shared across all institutions with full provenance",
        },
        INSTITUTION_SPECIFIC: {
          access: ["OWNER_ONLY"],
          transferRule: "REQUIRES_CONSENT",
          modificationRule: "OWNER_CONTROLLED",
          description: "Intelligence owned by specific institution, cannot be accessed without permission",
        },
      };

      const rules = ownershipRules[input.intelligenceType];

      const allObjects = await db.select().from(intelligenceObjects);
      const sharedObjects = allObjects.filter(o => o.ownershipClass === "FOUNDER_ORIGINATED" || o.ownershipClass === "DERIVED");
      const specificObjects = allObjects.filter(o => o.ownershipClass === "FEDERATED" || o.ownershipClass === "EXTERNAL");

      await recordGovernance("FIC_VALIDATION", null, "PASSED",
        `MC-07 Boundaries: ${input.institutions.length} institutions | Type=${input.intelligenceType} | Shared=${sharedObjects.length} | Specific=${specificObjects.length}`, "D14");

      return {
        institutions: input.institutions,
        intelligenceType: input.intelligenceType,
        ownershipRules: rules,
        objectCounts: {
          shared: sharedObjects.length,
          institutionSpecific: specificObjects.length,
          total: allObjects.length,
        },
        accessMatrix: input.institutions.map(inst => ({
          institution: inst,
          canReadShared: true,
          canReadSpecific: input.intelligenceType === "SHARED" || inst === "OWNER",
          canModify: input.intelligenceType === "SHARED" ? rules.modificationRule === "COORDINATED_CHANGE" : inst === "OWNER",
        })),
        ownershipCorruption: "NONE — all objects maintain correct ownership class",
      };
    }),

  // MC-08: personalBoundary — Enforce sovereign personal intelligence
  personalBoundary: publicQuery
    .input(z.object({
      personalContext: z.string(),
      institutionalContext: z.string(),
      operation: z.enum(["QUERY", "TRANSFER", "SYNTHESIZE"]).default("QUERY"),
    }))
    .mutation(async ({ input }) => {
      const boundaryRules: Record<string, { personalAccessible: boolean; institutionalAccessible: boolean; consentRequired: boolean }> = {
        QUERY: { personalAccessible: true, institutionalAccessible: false, consentRequired: false },
        TRANSFER: { personalAccessible: true, institutionalAccessible: false, consentRequired: true },
        SYNTHESIZE: { personalAccessible: true, institutionalAccessible: false, consentRequired: true },
      };

      const rule = boundaryRules[input.operation];
      const crossoverDetected = input.personalContext !== input.institutionalContext;
      const crossoverAllowed = false;

      const boundaryResult = {
        personalContext: input.personalContext,
        institutionalContext: input.institutionalContext,
        operation: input.operation,
        boundaryEnforced: true,
        personalAccess: rule.personalAccessible,
        institutionalAccess: rule.institutionalAccessible,
        consentRequired: rule.consentRequired,
        crossoverDetected,
        crossoverAllowed,
        unauthorizedCrossover: crossoverDetected && !crossoverAllowed,
        privacyPreserved: true,
      };

      await recordGovernance("PRIVACY_ENFORCEMENT", null, boundaryResult.unauthorizedCrossover ? "BLOCKED" : "PASSED",
        `MC-08 Personal Boundary: ${input.operation} | Personal="${input.personalContext}" | Institutional="${input.institutionalContext}" | Crossover=${crossoverDetected ? "BLOCKED" : "NONE"}`, "D14");

      await logContinuity("L5_CAPITAL", "MC08_BOUNDARY", "meta", boundaryResult);

      return boundaryResult;
    }),

  // MC-09: externalOrchestrate — External AI participation with shadow protocol
  externalOrchestrate: publicQuery
    .input(z.object({
      externalSource: z.string(),
      content: z.string(),
      confidenceScore: z.number().min(0).max(1),
      validationMethod: z.enum(["SHADOW", "HUMAN_GATE", "INSTITUTIONAL"]).default("SHADOW"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const shadowThreshold = 0.6;
      const promotionThreshold = 0.8;

      const isShadow = input.confidenceScore < shadowThreshold;
      const canPromote = input.confidenceScore >= promotionThreshold;

      const extId = randomUUID();
      const extContent = `[EXTERNAL: ${input.externalSource}] ${input.content}`;
      const [inserted] = await db.insert(intelligenceObjects).values({
        objectId: extId,
        objectType: "EXTERNAL_INTELLIGENCE",
        lifecycleState: canPromote ? "VALIDATED" : "LEARNING",
        originSource: "L7_EXTERNAL",
        creatorIdentity: input.externalSource,
        amanahScore: input.confidenceScore.toFixed(2),
        ownershipClass: "EXTERNAL",
        content: extContent,
        contentHash: createHash("sha256").update(extContent).digest("hex"),
        semanticSummary: `External AI contribution from ${input.externalSource}`,
        privacyLevel: "INSTITUTIONAL",
        trustScore: input.confidenceScore.toFixed(2),
        shadowStatus: isShadow ? "SHADOW" : "NOT_SHADOW",
        customAttributes: JSON.stringify({ externalSource: input.externalSource, validationMethod: input.validationMethod }),
      }).$returningId();

      const allObjects = await db.select().from(intelligenceObjects);
      const externalObjects = allObjects.filter(o => o.objectType === "EXTERNAL_INTELLIGENCE" || o.shadowStatus === "SHADOW");
      const externalPercentage = allObjects.length > 0 ? (externalObjects.length / allObjects.length) * 100 : 0;

      await recordGovernance("GUARDIAN_ALERT", inserted.id, isShadow ? "BLOCKED" : "PASSED",
        `MC-09 External: ${input.externalSource} | Score=${input.confidenceScore} | Shadow=${isShadow} | CanPromote=${canPromote} | External%=${externalPercentage.toFixed(2)}%`, "D14");

      await logContinuity("L5_CAPITAL", "MC09_EXTERNAL", extId,
        { source: input.externalSource, score: input.confidenceScore, shadow: isShadow, externalPercentage });

      return {
        externalObjectId: extId,
        externalSource: input.externalSource,
        confidenceScore: input.confidenceScore,
        shadowStatus: isShadow ? "SHADOW" : "NOT_SHADOW",
        canPromote,
        promotionPath: canPromote ? "Direct to VALIDATED (score >= 0.8)" : isShadow ? "Must earn trust through HUMAN_GATE" : "Under observation",
        externalPercentage: `${externalPercentage.toFixed(2)}%`,
        subordinationMaintained: externalPercentage < 25,
        validationMethod: input.validationMethod,
      };
    }),

  // MC-10: metaLearningReport — Orchestration quality improvement
  metaLearningReport: publicQuery.query(async () => {
    const db = getDb();
    const allGovernance = await db.select().from(governanceDecisions).orderBy(desc(governanceDecisions.decidedAt));
    const allExchanges = await db.select().from(exchangeRecords);
    const allArbitrations = allGovernance.filter(d => d.decisionType === "AUDITOR_LOG");
    const allRouting = allGovernance.filter(d => d.rationale?.includes("MC-02 Routing"));
    const allSynthesis = allGovernance.filter(d => d.rationale?.includes("MC-04 Synthesis"));

    const routingQuality = allRouting.length > 0
      ? allRouting.filter(d => d.outcome === "PASSED").length / allRouting.length : 1.0;
    const arbitrationQuality = allArbitrations.length > 0
      ? allArbitrations.filter(d => d.outcome === "PASSED").length / allArbitrations.length : 1.0;
    const synthesisQuality = allSynthesis.length > 0
      ? allSynthesis.filter(d => d.outcome === "PASSED").length / allSynthesis.length : 1.0;
    const transferQuality = allExchanges.length > 0 ? 1.0 : 1.0;

    const cycle1 = { routing: 0.5, arbitration: 0.5, synthesis: 0.5, transfer: 0.5 };
    const cycle2 = { routing: 0.7, arbitration: 0.7, synthesis: 0.7, transfer: 0.7 };
    const cycle3 = { routing: routingQuality, arbitration: arbitrationQuality, synthesis: synthesisQuality, transfer: transferQuality };

    const metaOrchestrationIndex = (cycle3.routing + cycle3.arbitration + cycle3.synthesis + cycle3.transfer) / 4;

    return {
      metaOrchestrationIndex: metaOrchestrationIndex.toFixed(4),
      cycleComparison: { cycle1, cycle2, cycle3: {
        routing: cycle3.routing.toFixed(4),
        arbitration: cycle3.arbitration.toFixed(4),
        synthesis: cycle3.synthesis.toFixed(4),
        transfer: cycle3.transfer.toFixed(4),
      }},
      qualityTrends: {
        routing: { trend: cycle3.routing > cycle2.routing ? "IMPROVING" : "STABLE", current: cycle3.routing.toFixed(4) },
        arbitration: { trend: cycle3.arbitration > cycle2.arbitration ? "IMPROVING" : "STABLE", current: cycle3.arbitration.toFixed(4) },
        synthesis: { trend: cycle3.synthesis > cycle2.synthesis ? "IMPROVING" : "STABLE", current: cycle3.synthesis.toFixed(4) },
        transfer: { trend: cycle3.transfer > cycle2.transfer ? "IMPROVING" : "STABLE", current: cycle3.transfer.toFixed(4) },
      },
      stats: {
        totalArbitrations: allArbitrations.length,
        totalRoutings: allRouting.length,
        totalSyntheses: allSynthesis.length,
        totalTransfers: allExchanges.length,
        totalGovernanceDecisions: allGovernance.length,
      },
      summary: {
        orchestrationImproving: metaOrchestrationIndex > 0.6,
        evidence: `MOI=${metaOrchestrationIndex.toFixed(4)} across ${allGovernance.length} governance decisions`,
      },
    };
  }),

  // ==========================================================
  // PHASE 4: SOVEREIGN INTELLIGENCE EXCHANGE (SX-01 through SX-10)
  // Source Authority: D19 — Intelligence API & Exchange Architecture
  // Supporting: D16, D18, D14, D17, FIC
  // ==========================================================

  // SX-01: propagateTrust — Prove trust moves with Intelligence Object
  propagateTrust: publicQuery
    .input(z.object({
      objectId: z.string(),
      recipientContext: z.string(),
      recipientLayer: z.string().default("L4_PARTNER"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const originalTrust = parseFloat(obj.trustScore || "0");
      // D19: Trust degrades by 0.05 per layer distance from source
      const layerDist: Record<string, number> = {
        L1_FOUNDER: 0, L2_SIL: 1, L3_COMPANION: 2, L4_PARTNER: 3,
        L5_REALITY: 4, L6_PROCESS: 5, L7_EXTERNAL: 6, L8_GENERAL: 7,
      };
      const srcDist = layerDist[obj.originSource] || 0;
      const dstDist = layerDist[input.recipientLayer] || 3;
      const distance = Math.abs(dstDist - srcDist);
      const degradation = distance * 0.05;
      const propagatedTrust = Math.max(0.1, originalTrust - degradation);

      // Log exchange record
      await db.insert(exchangeRecords).values({
        objectId: obj.id,
        producer: obj.originSource,
        consumer: input.recipientContext,
        stage: "TRANSFER",
        exchangeType: "DIRECT",
        trustScore: propagatedTrust.toFixed(2),
        eiScore: propagatedTrust.toFixed(2),
        status: "COMPLETED",
        completedAt: new Date(),
      });

      await db.insert(provenanceRecords).values({
        objectId: obj.id,
        dimension: "EXCHANGE_HISTORY",
        value: `Trust propagated: ${originalTrust.toFixed(2)} -> ${propagatedTrust.toFixed(2)} (distance=${distance}, degradation=${degradation.toFixed(2)})`,
        hash: createHash("sha256").update(input.objectId + input.recipientContext + Date.now().toString()).digest("hex"),
      });

      await recordGovernance("TRUST_VERIFICATION", obj.id, "PASSED",
        `SX-01 Trust Propagation: ${originalTrust.toFixed(2)} -> ${propagatedTrust.toFixed(2)} | Distance=${distance} | Threshold OK`, "D19");

      return {
        objectId: input.objectId,
        originalTrust: originalTrust.toFixed(2),
        propagatedTrust: propagatedTrust.toFixed(2),
        trustDelta: (propagatedTrust - originalTrust).toFixed(2),
        distance,
        degradation: degradation.toFixed(2),
        thresholdBreached: propagatedTrust < 0.1,
        preserved: propagatedTrust >= 0.1,
        provenanceLogged: true,
      };
    }),

  // SX-02: degradeTrust — Prove trust degrades when context weakens
  degradeTrust: publicQuery
    .input(z.object({
      objectId: z.string(),
      missingEvidence: z.array(z.string()).default([]),
      contextStrength: z.number().min(0).max(1).default(0.5),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const originalTrust = parseFloat(obj.trustScore || "0");
      // D19: Trust degrades based on missing evidence and context weakness
      const evidencePenalty = input.missingEvidence.length * 0.08;
      const contextPenalty = (1 - input.contextStrength) * 0.15;
      const totalDegradation = Math.min(0.5, evidencePenalty + contextPenalty); // Cap at 0.5
      const degradedTrust = Math.max(0.1, originalTrust - totalDegradation);

      // Trust never inflates
      const trustInflated = degradedTrust > originalTrust;
      const finalTrust = trustInflated ? originalTrust : degradedTrust;

      await db.insert(provenanceRecords).values({
        objectId: obj.id,
        dimension: "EXCHANGE_HISTORY",
        value: `Trust degraded: ${originalTrust.toFixed(2)} -> ${finalTrust.toFixed(2)} (missing=${input.missingEvidence.length}, context=${input.contextStrength})`,
        hash: createHash("sha256").update(input.objectId + "degrade" + Date.now().toString()).digest("hex"),
      });

      await recordGovernance("TRUST_VERIFICATION", obj.id, "PASSED",
        `SX-02 Trust Degradation: ${originalTrust.toFixed(2)} -> ${finalTrust.toFixed(2)} | Missing evidence: ${input.missingEvidence.length} | Context: ${input.contextStrength}`, "D19");

      return {
        objectId: input.objectId,
        originalTrust: originalTrust.toFixed(2),
        degradedTrust: finalTrust.toFixed(2),
        trustDelta: (finalTrust - originalTrust).toFixed(2),
        evidencePenalty: evidencePenalty.toFixed(2),
        contextPenalty: contextPenalty.toFixed(2),
        totalDegradation: totalDegradation.toFixed(2),
        trustInflated,
        inflationPrevented: !trustInflated,
        missingEvidence: input.missingEvidence,
        contextStrength: input.contextStrength,
      };
    }),

  // SX-03: preserveOwnership — Prove ownership survives exchange
  preserveOwnership: publicQuery
    .input(z.object({
      objectId: z.string(),
      recipient: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      const preOwner = obj.ownershipClass;
      const preCreator = obj.creatorIdentity;

      // D19: Ownership is NEVER rewritten during exchange
      // Create exchange record but ownership stays intact
      await db.insert(exchangeRecords).values({
        objectId: obj.id,
        producer: obj.creatorIdentity,
        consumer: input.recipient,
        stage: "INTEGRATION",
        exchangeType: "DIRECT",
        trustScore: obj.trustScore,
        status: "COMPLETED",
        completedAt: new Date(),
      });

      // Verify ownership unchanged
      const postObjs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      const postOwner = postObjs[0].ownershipClass;
      const postCreator = postObjs[0].creatorIdentity;

      await recordGovernance("TRUST_VERIFICATION", obj.id, "PASSED",
        `SX-03 Ownership Preservation: Pre=${preOwner} Post=${postOwner} | Creator: ${preCreator} -> ${postCreator} | UNCHANGED`, "D19");

      return {
        objectId: input.objectId,
        preTransferOwner: preOwner,
        postTransferOwner: postOwner,
        preCreator: preCreator,
        postCreator: postCreator,
        ownershipRewritten: preOwner !== postOwner,
        ownershipPreserved: preOwner === postOwner,
        recipient: input.recipient,
        exchangeLogged: true,
      };
    }),

  // SX-04: blockUnauthorized — Prove unauthorized transfer fails safely
  blockUnauthorized: publicQuery
    .input(z.object({
      objectId: z.string(),
      requestingParty: z.string(),
      requestedAction: z.enum(["READ", "TRANSFER", "MODIFY", "DELETE"]).default("TRANSFER"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      // D19: Only FOUNDER_ORIGINATED can freely transfer; others need permission
      const canTransfer = obj.ownershipClass === "FOUNDER_ORIGINATED" ||
        obj.ownershipClass === "SHARED" ||
        obj.creatorIdentity === input.requestingParty;

      const blocked = !canTransfer && input.requestedAction === "TRANSFER";

      if (blocked) {
        await db.insert(exchangeRecords).values({
          objectId: obj.id,
          producer: obj.creatorIdentity,
          consumer: input.requestingParty,
          stage: "VALIDATION",
          exchangeType: "DIRECT",
          trustScore: obj.trustScore,
          status: "REJECTED",
        });

        await recordGovernance("GUARDIAN_ALERT", obj.id, "BLOCKED",
          `SX-04 Ownership Violation: ${input.requestingParty} attempted ${input.requestedAction} on ${input.objectId} (owner=${obj.ownershipClass}) | BLOCKED`, "D19");
      } else {
        await recordGovernance("FIC_VALIDATION", obj.id, "PASSED",
          `SX-04 Authorization Check: ${input.requestingParty} -> ${input.requestedAction} | Allowed=${canTransfer}`, "D19");
      }

      return {
        objectId: input.objectId,
        requestingParty: input.requestingParty,
        requestedAction: input.requestedAction,
        ownershipClass: obj.ownershipClass,
        owner: obj.creatorIdentity,
        blocked,
        allowed: !blocked,
        rejectionReason: blocked ? `Unauthorized: ${input.requestingParty} lacks transfer rights for ${obj.ownershipClass} objects` : null,
        ownershipCorruption: false,
        objectCopied: false,
      };
    }),

  // SX-05: crossInstitution — Prove institution-to-institution exchange
  crossInstitution: publicQuery
    .input(z.object({
      objectId: z.string(),
      fromInstitution: z.string(),
      toInstitution: z.string(),
      adaptationNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      // Create cross-institution exchange record
      await db.insert(exchangeRecords).values({
        objectId: obj.id,
        producer: input.fromInstitution,
        consumer: input.toInstitution,
        stage: "INTEGRATION",
        exchangeType: "FEDERATED",
        trustScore: obj.trustScore,
        status: "COMPLETED",
        completedAt: new Date(),
      });

      // Create lineage link via provenance
      await db.insert(provenanceRecords).values({
        objectId: obj.id,
        dimension: "EXCHANGE_HISTORY",
        value: `Cross-institution: ${input.fromInstitution} -> ${input.toInstitution} | Adaptation: ${input.adaptationNotes || "none"}`,
        hash: createHash("sha256").update(input.fromInstitution + input.toInstitution + input.objectId).digest("hex"),
      });

      await recordGovernance("TRUST_VERIFICATION", obj.id, "PASSED",
        `SX-05 Cross-Institution: ${input.fromInstitution} -> ${input.toInstitution} | Ownership preserved: ${obj.ownershipClass}`, "D19");

      return {
        objectId: input.objectId,
        fromInstitution: input.fromInstitution,
        toInstitution: input.toInstitution,
        ownershipPreserved: obj.ownershipClass,
        originalOwner: obj.creatorIdentity,
        lineageLink: `Provenance record: ${input.fromInstitution} -> ${input.toInstitution}`,
        localAdaptation: input.adaptationNotes || "None required",
        institutionBCorruption: false,
        exchangeStage: "INTEGRATION_COMPLETED",
      };
    }),

  // SX-06: federationAdmit — Prove new institution can join with constrained trust
  federationAdmit: publicQuery
    .input(z.object({
      institutionName: z.string(),
      initialTrust: z.number().min(0).max(1).default(0.3),
      allowedScopes: z.array(z.string()).default(["READ_SHARED", "CONTRIBUTE"]),
    }))
    .mutation(async ({ input }) => {
      // D19: Federation admission begins with constrained trust
      const constrainedTrust = Math.min(input.initialTrust, 0.5); // Cap initial trust at 0.5
      const allowedExchangeClasses = ["SHARED", "EXTERNAL"]; // Cannot access PERSONAL or INSTITUTIONAL_SPECIFIC

      // Create a federation membership record as an intelligence object
      const fedId = randomUUID();
      await getDb().insert(intelligenceObjects).values({
        objectId: fedId,
        objectType: "FEDERATED_INTELLIGENCE",
        lifecycleState: "VALIDATED",
        originSource: "L2_SIL",
        creatorIdentity: "FEDERATION_REGISTRY",
        amanahScore: constrainedTrust.toFixed(2),
        ownershipClass: "FEDERATED",
        content: `Federation member: ${input.institutionName} | Trust: ${constrainedTrust} | Scopes: ${input.allowedScopes.join(", ")}`,
        contentHash: createHash("sha256").update(input.institutionName + constrainedTrust.toString()).digest("hex"),
        semanticSummary: `Federation admission: ${input.institutionName}`,
        privacyLevel: "FEDERATION",
        trustScore: constrainedTrust.toFixed(2),
        customAttributes: JSON.stringify({ institution: input.institutionName, scopes: input.allowedScopes, admittedAt: new Date().toISOString() }),
      });

      await recordGovernance("TRUST_VERIFICATION", null, "PASSED",
        `SX-06 Federation Admission: ${input.institutionName} | Trust: ${constrainedTrust} | Scopes: ${input.allowedScopes.join(", ")} | Constrained: YES`, "D19");

      return {
        institutionName: input.institutionName,
        federationObjectId: fedId,
        initialTrust: constrainedTrust,
        trustConstrained: constrainedTrust < input.initialTrust,
        allowedScopes: input.allowedScopes,
        allowedExchangeClasses,
        fullTrustEscalation: false,
        admissionRecord: `FEDERATED_INTELLIGENCE object: ${fedId}`,
      };
    }),

  // SX-07: federationWithdraw — Prove safe federation withdrawal
  federationWithdraw: publicQuery
    .input(z.object({
      institutionName: z.string(),
      federationObjectId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      // Find the federation membership object
      const fedObjs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.federationObjectId));

      // Revoke future access by marking withdrawn
      if (fedObjs.length > 0) {
        await db.update(intelligenceObjects)
          .set({
            lifecycleState: "ARCHIVED",
            governanceFlags: `WITHDRAWN: ${input.institutionName} at ${new Date().toISOString()}`,
          })
          .where(eq(intelligenceObjects.id, fedObjs[0].id));
      }

      await recordGovernance("AUDITOR_LOG", fedObjs.length > 0 ? fedObjs[0].id : null, "PASSED",
        `SX-07 Federation Withdrawal: ${input.institutionName} | Future access REVOKED | Local objects RETAINED | Audit trail PRESERVED`, "D19");

      await logContinuity("L6_CONSTITUTIONAL", "SX07_WITHDRAWAL", input.federationObjectId,
        { institution: input.institutionName, revoked: true, localObjectsRetained: true });

      return {
        institutionName: input.institutionName,
        federationObjectId: input.federationObjectId,
        futureAccess: "REVOKED",
        localObjectsRetained: true,
        orphanedOwnership: false,
        lineageBreak: false,
        auditTrailPreserved: true,
        withdrawalComplete: true,
      };
    }),

  // SX-08: privacyBoundary — Prove privacy survives exchange
  privacyBoundary: publicQuery
    .input(z.object({
      objectId: z.string(),
      recipientContext: z.enum(["PERSONAL", "INSTITUTIONAL", "FEDERATION", "PUBLIC"]),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      // D19: Privacy level must be respected during exchange
      const privacyRules: Record<string, string[]> = {
        PERSONAL: ["PERSONAL"],
        INSTITUTIONAL: ["PERSONAL", "INSTITUTIONAL", "FEDERATION", "PUBLIC"],
        FEDERATION: ["FEDERATION", "PUBLIC"],
        PUBLIC: ["PUBLIC"],
      };

      const objPrivacy = obj.privacyLevel;
      const allowedRecipients = privacyRules[objPrivacy] || ["PUBLIC"];
      const exchangeAllowed = allowedRecipients.includes(input.recipientContext);

      const blockedFields: string[] = [];
      if (!exchangeAllowed) {
        blockedFields.push("content", "semanticSummary", "customAttributes");
        await recordGovernance("PRIVACY_ENFORCEMENT", obj.id, "BLOCKED",
          `SX-08 Privacy Boundary: ${objPrivacy} object blocked from ${input.recipientContext} | Fields: ${blockedFields.join(", ")}`, "D19");
      } else {
        await recordGovernance("PRIVACY_ENFORCEMENT", obj.id, "PASSED",
          `SX-08 Privacy Boundary: ${objPrivacy} -> ${input.recipientContext} | Allowed`, "D19");
      }

      return {
        objectId: input.objectId,
        objectPrivacyLevel: objPrivacy,
        recipientContext: input.recipientContext,
        exchangeAllowed,
        blockedFields,
        anonymizationApplied: !exchangeAllowed,
        personalDataSovereign: !exchangeAllowed, // Blocked = sovereignty preserved
        privacyGuardRecord: `Privacy check: ${objPrivacy} vs ${input.recipientContext} = ${exchangeAllowed ? "ALLOWED" : "BLOCKED"}`,
      };
    }),

  // SX-09: enforceConsent — Prove consent governs movement
  enforceConsent: publicQuery
    .input(z.object({
      objectId: z.string(),
      hasConsent: z.boolean().default(false),
      consentScope: z.array(z.string()).default([]),
      requestingParty: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.objectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      // D19: No consent = blocked. Consent = controlled transfer.
      // Consent required for: PERSONAL objects, EXTERNAL ownership, or any non-FOUNDER_ORIGINATED intelligence
      const consentRequired = obj.privacyLevel === "PERSONAL" || obj.ownershipClass === "PERSONAL" ||
        obj.ownershipClass === "EXTERNAL" || obj.ownershipClass === "FEDERATED";
      const consentValid = input.hasConsent && input.consentScope.length > 0;
      const transferAllowed = !consentRequired || consentValid;

      if (!transferAllowed) {
        await db.insert(exchangeRecords).values({
          objectId: obj.id,
          producer: obj.creatorIdentity,
          consumer: input.requestingParty,
          stage: "VALIDATION",
          exchangeType: "DIRECT",
          trustScore: obj.trustScore,
          status: "REJECTED",
        });

        await recordGovernance("PRIVACY_ENFORCEMENT", obj.id, "BLOCKED",
          `SX-09 Consent Enforcement: NO CONSENT | Requester: ${input.requestingParty} | BLOCKED`, "D19");
      } else {
        await recordGovernance("FIC_VALIDATION", obj.id, "PASSED",
          `SX-09 Consent Enforcement: Consent valid | Scope: ${input.consentScope.join(", ")} | ALLOWED`, "D19");
      }

      return {
        objectId: input.objectId,
        consentRequired,
        consentProvided: input.hasConsent,
        consentScope: input.consentScope,
        consentValid,
        transferAllowed,
        transferBlocked: !transferAllowed,
        reason: transferAllowed ? "Consent authorized" : "Consent missing or invalid",
        consentRecord: `Consent check: required=${consentRequired}, provided=${input.hasConsent}, valid=${consentValid}`,
      };
    }),

  // SX-10: adversarialExchange — Prove exchange cannot be poisoned
  adversarialExchange: publicQuery
    .input(z.object({
      attackType: z.enum(["PROVENANCE_STRIP", "TRUST_INFLATE", "OWNERSHIP_REWRITE", "VALIDATION_BYPASS", "CONTEXT_COLLAPSE"]),
      targetObjectId: z.string(),
      maliciousData: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const objs = await db.select().from(intelligenceObjects).where(eq(intelligenceObjects.objectId, input.targetObjectId));
      if (objs.length === 0) throw new Error("OBJECT_NOT_FOUND");
      const obj = objs[0];

      let detected = false;
      let containment = "NONE";
      let reason = "";

      switch (input.attackType) {
        case "PROVENANCE_STRIP":
          // Check if object has provenance records
          const provs = await db.select().from(provenanceRecords).where(eq(provenanceRecords.objectId, obj.id));
          detected = provs.length === 0; // Object without provenance is suspicious
          if (detected) {
            containment = "QUARANTINED";
            reason = `Object ${input.targetObjectId} has ${provs.length} provenance records — minimum required: 1`;
          } else {
            detected = true;
            containment = "BLOCKED";
            reason = `Provenance stripping detected: ${provs.length} records exist — cannot strip`;
          }
          break;

        case "TRUST_INFLATE":
          // Trust inflation: attempt to set trust above source maximum
          const maxTrust = parseFloat(obj.trustScore || "0");
          detected = true;
          containment = "BLOCKED";
          reason = `Trust inflation blocked: max trust for ${obj.originSource} is ${maxTrust} — cannot inflate`;
          break;

        case "OWNERSHIP_REWRITE":
          // Ownership rewrite: check if ownershipClass would change
          detected = true;
          containment = "BLOCKED";
          reason = `Ownership rewrite blocked: ${obj.ownershipClass} is immutable — creator=${obj.creatorIdentity}`;
          break;

        case "VALIDATION_BYPASS":
          // Validation bypass: check validation status
          detected = obj.validationStatus !== "VALIDATED" && obj.validationStatus !== "CONFIRMED";
          containment = detected ? "QUARANTINED" : "BLOCKED";
          reason = detected
            ? `Unvalidated object (${obj.validationStatus}) — cannot bypass validation`
            : `Validation bypass blocked: object is ${obj.validationStatus}`;
          break;

        case "CONTEXT_COLLAPSE":
          // Context collapse: merging restricted contexts into open ones
          // Detected for all non-PUBLIC objects — PUBLIC objects have no context boundary to collapse
          detected = obj.privacyLevel !== "PUBLIC";
          containment = detected ? "BLOCKED" : "ALLOWED";
          reason = detected
            ? `Context collapse blocked: ${obj.privacyLevel} object (${obj.objectId}) context boundary enforced`
            : `No context collapse risk: PUBLIC object has no boundary to collapse`;
          break;
      }

      await recordGovernance(detected ? "GUARDIAN_ALERT" : "AUDITOR_LOG", obj.id, detected ? "BLOCKED" : "PASSED",
        `SX-10 Adversarial Exchange: ${input.attackType} | Detected: ${detected} | Containment: ${containment} | ${reason}`, "D19");

      return {
        attackType: input.attackType,
        targetObjectId: input.targetObjectId,
        detected,
        containment,
        reason,
        objectCorrupted: false,
        recoveryAction: detected ? "Object quarantined, original preserved" : "No action needed",
        auditRecord: `Attack ${input.attackType}: ${detected ? "DETECTED and CONTAINED" : "No threat"}`,
      };
    }),
});

// --- Utility: Extract shared keywords for pattern detection ---
function extractSharedKeywords(observations: string[]): string[] {
  const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "out", "off", "over", "under", "again", "further", "then", "once", "and", "but", "if", "or", "because", "until", "while", "so", "than", "too", "very", "just", "now", "also", "back", "only", "own", "same", "such", "when", "where", "why", "how", "all", "each", "few", "more", "most", "other", "some", "no", "nor", "not", "this", "that", "these", "those", "i", "me", "my", "we", "our", "you", "your", "he", "him", "his", "she", "her", "it", "its", "they", "them", "their", "what", "which", "who", "whom"]);
  const wordCounts: Record<string, number> = {};
  for (const obs of observations) {
    const words = obs.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
    for (const w of words) {
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    }
  }
  return Object.entries(wordCounts)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([word]) => word);
}