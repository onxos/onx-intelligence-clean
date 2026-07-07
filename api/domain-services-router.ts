// =============================================================================
// DOMAIN SERVICES ROUTER — D01, D05, D06, D08, D14, D15, D18
// Wired to real MySQL/SQLite DB via drizzle-orm
// Covers: Call Center, Inventory, CRM, Analytics, BI, Branches, Notifications
// =============================================================================
import { z } from "zod";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  callCenterTickets,
  inventoryItems,
  crmContacts,
  analyticsReports,
  biMetrics,
  branches,
  notifications,
  labResults,
} from "../db/schema";

// ─────────────────────────────────────────────────────────────────────────────
// D01: Call Center Operations
// ─────────────────────────────────────────────────────────────────────────────

const callCenterRouter = createRouter({
  // Create a ticket
  create: publicQuery
    .input(z.object({
      customerId: z.string().optional(),
      agentId: z.string().optional(),
      category: z.enum(["APPOINTMENT", "BILLING", "COMPLAINT", "INQUIRY", "EMERGENCY", "FOLLOWUP"]),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      subject: z.string().min(1).max(255),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const ticketId = `TKT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await db.insert(callCenterTickets).values({
        ticketId,
        customerId: input.customerId,
        agentId: input.agentId,
        category: input.category,
        priority: input.priority,
        subject: input.subject,
        description: input.description,
        status: "OPEN",
      });
      return { ticketId, status: "OPEN" };
    }),

  // List tickets with optional filters
  list: publicQuery
    .input(z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "ESCALATED", "CLOSED"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
      limit: z.number().max(50).default(20),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(callCenterTickets)
        .orderBy(desc(callCenterTickets.createdAt))
        .limit(input.limit);
      return rows.filter((r) => {
        if (input.status && r.status !== input.status) return false;
        if (input.priority && r.priority !== input.priority) return false;
        return true;
      });
    }),

  // Resolve a ticket
  resolve: publicQuery
    .input(z.object({ ticketId: z.string(), resolution: z.string(), satisfactionScore: z.number().min(0).max(10).optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(callCenterTickets)
        .set({ status: "RESOLVED", resolution: input.resolution, resolvedAt: new Date() })
        .where(eq(callCenterTickets.ticketId, input.ticketId));
      return { resolved: true, ticketId: input.ticketId };
    }),

  // Stats
  stats: publicQuery.query(async () => {
    const db = getDb();
    const all = await db.select().from(callCenterTickets).limit(1000);
    return {
      total: all.length,
      open: all.filter((r) => r.status === "OPEN").length,
      inProgress: all.filter((r) => r.status === "IN_PROGRESS").length,
      resolved: all.filter((r) => r.status === "RESOLVED").length,
      critical: all.filter((r) => r.priority === "CRITICAL").length,
      byCategory: Object.fromEntries(
        ["APPOINTMENT", "BILLING", "COMPLAINT", "INQUIRY", "EMERGENCY", "FOLLOWUP"].map((c) => [
          c, all.filter((r) => r.category === c).length,
        ])
      ),
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D05: Inventory & Pharmacy
// ─────────────────────────────────────────────────────────────────────────────

const inventoryRouter = createRouter({
  // Add item
  add: publicQuery
    .input(z.object({
      name: z.string().min(1),
      nameAr: z.string().optional(),
      category: z.enum(["MEDICINE", "VACCINE", "EQUIPMENT", "CONSUMABLE", "FEED", "SUPPLEMENT"]),
      unit: z.string(),
      currentStock: z.number().min(0),
      minStock: z.number().min(0),
      costPrice: z.number().optional(),
      sellingPrice: z.number().optional(),
      supplier: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const itemCode = `ITM-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      await db.insert(inventoryItems).values({
        itemCode,
        name: input.name,
        nameAr: input.nameAr,
        category: input.category,
        unit: input.unit,
        currentStock: String(input.currentStock),
        minStock: String(input.minStock),
        costPrice: input.costPrice ? String(input.costPrice) : undefined,
        sellingPrice: input.sellingPrice ? String(input.sellingPrice) : undefined,
        supplier: input.supplier,
      });
      return { itemCode, added: true };
    }),

  // List all items
  list: publicQuery
    .input(z.object({ category: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(inventoryItems).limit(input.limit);
      return rows.filter((r) => !input.category || r.category === input.category);
    }),

  // Low stock alerts
  lowStock: publicQuery.query(async () => {
    const db = getDb();
    const all = await db.select().from(inventoryItems).limit(500);
    return all.filter((r) => Number(r.currentStock) <= Number(r.minStock)).map((r) => ({
      itemCode: r.itemCode,
      name: r.name,
      nameAr: r.nameAr,
      category: r.category,
      currentStock: Number(r.currentStock),
      minStock: Number(r.minStock),
      deficit: Math.max(0, Number(r.minStock) - Number(r.currentStock)),
    }));
  }),

  // Adjust stock
  adjust: publicQuery
    .input(z.object({ itemCode: z.string(), quantity: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.itemCode, input.itemCode));
      if (!item) throw new Error("ITEM_NOT_FOUND");
      const newStock = Math.max(0, Number(item.currentStock) + input.quantity);
      await db.update(inventoryItems).set({ currentStock: String(newStock) }).where(eq(inventoryItems.itemCode, input.itemCode));
      return { itemCode: input.itemCode, oldStock: Number(item.currentStock), newStock };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D06: CRM / Marketing
// ─────────────────────────────────────────────────────────────────────────────

const crmRouter = createRouter({
  // Add contact
  add: publicQuery
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      type: z.enum(["LEAD", "PROSPECT", "CUSTOMER", "VIP", "PARTNER"]).default("LEAD"),
      stage: z.enum(["AWARENESS", "INTEREST", "CONSIDERATION", "INTENT", "PURCHASE", "RETENTION"]).default("AWARENESS"),
      source: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const contactId = `CRM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await db.insert(crmContacts).values({ ...input, contactId });
      return { contactId, added: true };
    }),

  // List contacts
  list: publicQuery
    .input(z.object({ type: z.string().optional(), stage: z.string().optional(), limit: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(crmContacts).orderBy(desc(crmContacts.createdAt)).limit(input.limit);
      return rows.filter((r) => {
        if (input.type && r.type !== input.type) return false;
        if (input.stage && r.stage !== input.stage) return false;
        return true;
      });
    }),

  // Pipeline stats
  pipeline: publicQuery.query(async () => {
    const db = getDb();
    const all = await db.select().from(crmContacts).limit(1000);
    const stages = ["AWARENESS", "INTEREST", "CONSIDERATION", "INTENT", "PURCHASE", "RETENTION"];
    return {
      total: all.length,
      byStage: Object.fromEntries(stages.map((s) => [s, all.filter((r) => r.stage === s).length])),
      byType: Object.fromEntries(["LEAD", "PROSPECT", "CUSTOMER", "VIP", "PARTNER"].map((t) => [t, all.filter((r) => r.type === t).length])),
      conversionRate: all.length > 0 ? Math.round((all.filter((r) => r.stage === "PURCHASE" || r.stage === "RETENTION").length / all.length) * 10000) / 100 : 0,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D08: Analytics & Reporting
// ─────────────────────────────────────────────────────────────────────────────

const analyticsRouter = createRouter({
  // Generate report
  generate: publicQuery
    .input(z.object({
      type: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "MOA_GOVERNMENT", "CLINICAL", "FINANCIAL", "OPERATIONAL"]),
      title: z.string(),
      period: z.string(),
      data: z.record(z.unknown()),
      moaFormat: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const reportId = `RPT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await db.insert(analyticsReports).values({
        reportId,
        type: input.type,
        title: input.title,
        period: input.period,
        data: JSON.stringify(input.data),
        moaFormat: input.moaFormat ? 1 : 0,
        status: "DRAFT",
        generatedBy: "ONX Intelligence AI",
      });
      return { reportId, type: input.type, status: "DRAFT" };
    }),

  // List reports
  list: publicQuery
    .input(z.object({ type: z.string().optional(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(analyticsReports).orderBy(desc(analyticsReports.createdAt)).limit(input.limit);
      return rows.filter((r) => !input.type || r.type === input.type).map((r) => ({
        reportId: r.reportId,
        type: r.type,
        title: r.title,
        period: r.period,
        status: r.status,
        moaFormat: r.moaFormat,
        createdAt: r.createdAt,
      }));
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D14: Business Intelligence (KPIs)
// ─────────────────────────────────────────────────────────────────────────────

const biRouter = createRouter({
  // Record a KPI metric
  record: publicQuery
    .input(z.object({
      name: z.string(),
      category: z.enum(["REVENUE", "PATIENTS", "EFFICIENCY", "SATISFACTION", "GROWTH", "COMPLIANCE", "AI_PERFORMANCE"]),
      value: z.number(),
      unit: z.string().optional(),
      period: z.string(),
      target: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const metricId = `BI-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await db.insert(biMetrics).values({
        metricId,
        name: input.name,
        category: input.category,
        value: String(input.value),
        unit: input.unit,
        period: input.period,
        target: input.target ? String(input.target) : undefined,
        trend: "STABLE",
      });
      return { metricId, recorded: true };
    }),

  // Latest KPIs
  latest: publicQuery
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(biMetrics).orderBy(desc(biMetrics.recordedAt)).limit(input.limit);
      return rows.map((r) => ({
        metricId: r.metricId,
        name: r.name,
        category: r.category,
        value: Number(r.value),
        unit: r.unit,
        period: r.period,
        target: r.target ? Number(r.target) : null,
        achievementRate: r.target ? Math.round((Number(r.value) / Number(r.target)) * 10000) / 100 : null,
        trend: r.trend,
        recordedAt: r.recordedAt,
      }));
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D15: Organization & Branches
// ─────────────────────────────────────────────────────────────────────────────

const branchesRouter = createRouter({
  // Add branch
  add: publicQuery
    .input(z.object({
      name: z.string().min(1),
      nameAr: z.string().optional(),
      type: z.enum(["PILOT", "MAIN", "SATELLITE", "MOBILE"]).default("PILOT"),
      city: z.string().optional(),
      region: z.string().optional(),
      managerName: z.string().optional(),
      revenueTarget: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const branchId = `BR-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      await db.insert(branches).values({
        branchId,
        name: input.name,
        nameAr: input.nameAr,
        type: input.type,
        city: input.city,
        region: input.region,
        managerName: input.managerName,
        revenueTarget: input.revenueTarget ? String(input.revenueTarget) : undefined,
        status: "PLANNING",
        staffCount: 0,
        patientsPerDay: 0,
      });
      return { branchId, added: true };
    }),

  // List all branches
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(branches).orderBy(desc(branches.createdAt)).limit(50);
  }),

  // Stats
  stats: publicQuery.query(async () => {
    const db = getDb();
    const all = await db.select().from(branches).limit(100);
    return {
      total: all.length,
      active: all.filter((b) => b.status === "ACTIVE").length,
      pilot: all.filter((b) => b.status === "PLANNING").length,
      totalStaff: all.reduce((s, b) => s + (b.staffCount ?? 0), 0),
      totalPatientsPerDay: all.reduce((s, b) => s + (b.patientsPerDay ?? 0), 0),
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D18: Notifications
// ─────────────────────────────────────────────────────────────────────────────

const notificationsRouter = createRouter({
  // Send notification
  send: publicQuery
    .input(z.object({
      recipientId: z.string(),
      channel: z.enum(["PUSH", "SMS", "EMAIL", "WHATSAPP", "IN_APP"]),
      type: z.enum(["APPOINTMENT_REMINDER", "RESULT_READY", "PAYMENT_DUE", "ALERT", "REPORT_READY", "GPS_DELAY", "SYSTEM"]),
      title: z.string(),
      body: z.string(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
      scheduledAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const notificationId = `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await db.insert(notifications).values({
        notificationId,
        recipientId: input.recipientId,
        channel: input.channel,
        type: input.type,
        title: input.title,
        body: input.body,
        priority: input.priority,
        status: "PENDING",
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
      });
      return { notificationId, status: "PENDING" };
    }),

  // List notifications for recipient
  list: publicQuery
    .input(z.object({ recipientId: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(notifications)
        .where(eq(notifications.recipientId, input.recipientId))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
    }),

  // Stats
  stats: publicQuery.query(async () => {
    const db = getDb();
    const all = await db.select().from(notifications).limit(1000);
    return {
      total: all.length,
      pending: all.filter((n) => n.status === "PENDING").length,
      sent: all.filter((n) => n.status === "SENT").length,
      failed: all.filter((n) => n.status === "FAILED").length,
      urgent: all.filter((n) => n.priority === "URGENT").length,
      byChannel: Object.fromEntries(
        ["PUSH", "SMS", "EMAIL", "WHATSAPP", "IN_APP"].map((c) => [c, all.filter((n) => n.channel === c).length])
      ),
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D10: Laboratory Results
// ─────────────────────────────────────────────────────────────────────────────

const labRouter = createRouter({
  // Add lab result
  add: publicQuery
    .input(z.object({
      patientId: z.string(),
      sessionId: z.string().optional(),
      testType: z.enum(["CBC", "BIOCHEMISTRY", "URINALYSIS", "MICROBIOLOGY", "PARASITOLOGY", "SEROLOGY", "PATHOLOGY", "IMAGING"]),
      testName: z.string(),
      results: z.record(z.unknown()),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const labId = `LAB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await db.insert(labResults).values({
        labId,
        patientId: input.patientId,
        sessionId: input.sessionId,
        testType: input.testType,
        testName: input.testName,
        results: JSON.stringify(input.results),
        status: "PENDING",
        flagged: 0,
        collectedAt: new Date(),
      });
      return { labId, status: "PENDING" };
    }),

  // Patient results
  forPatient: publicQuery
    .input(z.object({ patientId: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(labResults)
        .where(eq(labResults.patientId, input.patientId))
        .orderBy(desc(labResults.createdAt))
        .limit(input.limit);
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED DOMAIN SERVICES ROUTER
// ─────────────────────────────────────────────────────────────────────────────

export const domainServicesRouter = createRouter({
  callCenter: callCenterRouter,
  inventory: inventoryRouter,
  crm: crmRouter,
  analytics: analyticsRouter,
  bi: biRouter,
  branches: branchesRouter,
  notifications: notificationsRouter,
  lab: labRouter,
});
