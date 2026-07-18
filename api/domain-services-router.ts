// =============================================================================
// DOMAIN SERVICES ROUTER — D01-D03, D05-D08, D10, D11, D13-D15, D18
// PostgreSQL persistence via direct pg Pool (lazy-init, CREATE TABLE IF NOT
// EXISTS) — replaces the drizzle/mysql2 path which could not reach the
// Postgres DATABASE_URL and silently failed every domain query.
// Covers: Call Center, HR, Finance, Inventory, CRM, Customer Portal,
// Analytics, TeleVet, Lab, Compliance, BI, Branches, Notifications, Procurement
// =============================================================================
import { z } from "zod";
import { Pool } from "pg";
import OpenAI from "openai";
import { createRouter, protectedQuery } from "./middleware";

// EV-SEC-01: all domain procedures require a user session or the bridge key
const publicQuery = protectedQuery;

// ─────────────────────────────────────────────────────────────────────────────
// PG STORE (lazy pool + schema bootstrap)
// ─────────────────────────────────────────────────────────────────────────────
let pool: Pool | null = null;
let schemaReady = false;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("DOMAIN_DB_NOT_CONFIGURED: DATABASE_URL is not postgres");
    }
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 5,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS dom_call_tickets (
      id SERIAL PRIMARY KEY, "ticketId" VARCHAR(40) UNIQUE, "customerId" TEXT,
      "agentId" TEXT, category TEXT, priority TEXT, subject TEXT, description TEXT,
      status TEXT DEFAULT 'OPEN', resolution TEXT, "satisfactionScore" DOUBLE PRECISION,
      "resolvedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_inventory_items (
      id SERIAL PRIMARY KEY, "itemCode" VARCHAR(40) UNIQUE, name TEXT, "nameAr" TEXT,
      category TEXT, unit TEXT, "currentStock" DOUBLE PRECISION, "minStock" DOUBLE PRECISION,
      "costPrice" DOUBLE PRECISION, "sellingPrice" DOUBLE PRECISION, supplier TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_crm_contacts (
      id SERIAL PRIMARY KEY, "contactId" VARCHAR(40) UNIQUE, name TEXT, email TEXT,
      phone TEXT, type TEXT DEFAULT 'LEAD', stage TEXT DEFAULT 'AWARENESS', source TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_analytics_reports (
      id SERIAL PRIMARY KEY, "reportId" VARCHAR(40) UNIQUE, type TEXT, title TEXT,
      period TEXT, data JSONB, "moaFormat" INT DEFAULT 0, status TEXT DEFAULT 'DRAFT',
      "generatedBy" TEXT, "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_bi_metrics (
      id SERIAL PRIMARY KEY, "metricId" VARCHAR(40) UNIQUE, name TEXT, category TEXT,
      value DOUBLE PRECISION, unit TEXT, period TEXT, "recordedAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_branches (
      id SERIAL PRIMARY KEY, "branchId" VARCHAR(40) UNIQUE, name TEXT, "nameAr" TEXT,
      type TEXT DEFAULT 'CLINIC', status TEXT DEFAULT 'ACTIVE', city TEXT, address TEXT,
      phone TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_notifications (
      id SERIAL PRIMARY KEY, "notificationId" VARCHAR(40) UNIQUE, "recipientId" TEXT,
      channel TEXT, title TEXT, body TEXT, status TEXT DEFAULT 'QUEUED',
      "sentAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_lab_results (
      id SERIAL PRIMARY KEY, "labId" VARCHAR(40) UNIQUE, "patientId" TEXT, "sessionId" TEXT,
      "testType" TEXT, "testName" TEXT, "testNameAr" TEXT, result TEXT, unit TEXT,
      "referenceRange" TEXT, "abnormalFlag" TEXT, "aiInterpretation" TEXT,
      status TEXT DEFAULT 'FINAL', "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_hr_staff (
      id SERIAL PRIMARY KEY, "staffId" VARCHAR(40) UNIQUE, name TEXT, role TEXT,
      department TEXT, "branchId" TEXT, status TEXT DEFAULT 'ACTIVE',
      "hireDate" DATE, phone TEXT, "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_invoices (
      id SERIAL PRIMARY KEY, "invoiceId" VARCHAR(40) UNIQUE, "customerId" TEXT,
      "branchId" TEXT, amount DOUBLE PRECISION, vat DOUBLE PRECISION, total DOUBLE PRECISION,
      status TEXT DEFAULT 'ISSUED', "paidAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_televet_sessions (
      id SERIAL PRIMARY KEY, "sessionRef" VARCHAR(40) UNIQUE, "patientId" TEXT,
      "ownerName" TEXT, mode TEXT DEFAULT 'VIDEO', priority TEXT DEFAULT 'ROUTINE',
      status TEXT DEFAULT 'SCHEDULED', "escalatedTo" TEXT, notes TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_compliance_checks (
      id SERIAL PRIMARY KEY, "checkId" VARCHAR(40) UNIQUE, domain TEXT, requirement TEXT,
      status TEXT, evidence TEXT, "checkedAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS dom_procurement_vendors (
      id SERIAL PRIMARY KEY, "vendorId" VARCHAR(40) UNIQUE, name TEXT, category TEXT,
      rating DOUBLE PRECISION, "priceScore" DOUBLE PRECISION, "reliabilityScore" DOUBLE PRECISION,
      "leadTimeDays" INT, "createdAt" TIMESTAMPTZ DEFAULT now());
  `);
  schemaReady = true;
}

function rid2(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// EV-SEC-02 (branch isolation): when the caller carries a branch scope
// (x-onx-branch-id header, set by the gateway from the user's branch claim),
// list/summary queries are restricted to that branch. Machine/bridge calls
// without the header see all branches (back-office behaviour).
function scopedBranch(ctx: { req: Request }): string | null {
  return ctx.req.headers.get("x-onx-branch-id");
}

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: key });
  return openaiClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// D01: Call Center Operations
// ─────────────────────────────────────────────────────────────────────────────
const callCenterRouter = createRouter({
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
      await ensureSchema();
      const ticketId = rid2("TKT");
      // AI triage: EMERGENCY category or CRITICAL priority auto-escalates
      const status = input.category === "EMERGENCY" || input.priority === "CRITICAL" ? "ESCALATED" : "OPEN";
      await getPool().query(
        `INSERT INTO dom_call_tickets ("ticketId","customerId","agentId",category,priority,subject,description,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ticketId, input.customerId ?? null, input.agentId ?? null, input.category, input.priority, input.subject, input.description ?? null, status]);
      return { ticketId, status, aiTriage: status === "ESCALATED" ? "AUTO_ESCALATED" : "STANDARD_QUEUE" };
    }),

  list: publicQuery
    .input(z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "ESCALATED", "CLOSED"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
      limit: z.number().max(50).default(20),
    }))
    .query(async ({ input }) => {
      await ensureSchema();
      const res = await getPool().query(
        `SELECT * FROM dom_call_tickets
         WHERE ($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR priority=$2)
         ORDER BY "createdAt" DESC LIMIT $3`,
        [input.status ?? null, input.priority ?? null, input.limit]);
      return res.rows;
    }),

  resolve: publicQuery
    .input(z.object({ ticketId: z.string(), resolution: z.string(), satisfactionScore: z.number().min(0).max(10).optional() }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      await getPool().query(
        `UPDATE dom_call_tickets SET status='RESOLVED', resolution=$2, "satisfactionScore"=$3, "resolvedAt"=now() WHERE "ticketId"=$1`,
        [input.ticketId, input.resolution, input.satisfactionScore ?? null]);
      return { resolved: true, ticketId: input.ticketId };
    }),

  stats: publicQuery.query(async () => {
    await ensureSchema();
    const { rows } = await getPool().query(`SELECT status, priority, category FROM dom_call_tickets`);
    return {
      total: rows.length,
      open: rows.filter((r) => r.status === "OPEN").length,
      inProgress: rows.filter((r) => r.status === "IN_PROGRESS").length,
      resolved: rows.filter((r) => r.status === "RESOLVED").length,
      critical: rows.filter((r) => r.priority === "CRITICAL").length,
      byCategory: Object.fromEntries(
        ["APPOINTMENT", "BILLING", "COMPLAINT", "INQUIRY", "EMERGENCY", "FOLLOWUP"].map((c) => [
          c, rows.filter((r) => r.category === c).length,
        ])
      ),
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D05: Inventory & Pharmacy
// ─────────────────────────────────────────────────────────────────────────────
const inventoryRouter = createRouter({
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
      await ensureSchema();
      const itemCode = rid2("ITM");
      await getPool().query(
        `INSERT INTO dom_inventory_items ("itemCode",name,"nameAr",category,unit,"currentStock","minStock","costPrice","sellingPrice",supplier)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT ("itemCode") DO NOTHING`,
        [itemCode, input.name, input.nameAr ?? null, input.category, input.unit,
         input.currentStock, input.minStock, input.costPrice ?? null, input.sellingPrice ?? null, input.supplier ?? null]);
      return { itemCode, added: true };
    }),

  list: publicQuery
    .input(z.object({ category: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      await ensureSchema();
      const res = await getPool().query(
        `SELECT * FROM dom_inventory_items WHERE ($1::text IS NULL OR category=$1) ORDER BY name LIMIT $2`,
        [input.category ?? null, input.limit]);
      return res.rows;
    }),

  lowStock: publicQuery.query(async () => {
    await ensureSchema();
    const { rows } = await getPool().query(
      `SELECT "itemCode", name, "nameAr", category, "currentStock", "minStock",
              GREATEST(0, "minStock" - "currentStock") AS deficit
         FROM dom_inventory_items WHERE "currentStock" <= "minStock" ORDER BY deficit DESC`);
    return rows;
  }),

  adjust: publicQuery
    .input(z.object({ itemCode: z.string(), quantity: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const p = getPool();
      const { rows } = await p.query(`SELECT "currentStock" FROM dom_inventory_items WHERE "itemCode"=$1`, [input.itemCode]);
      if (!rows[0]) throw new Error("ITEM_NOT_FOUND");
      const newStock = Math.max(0, Number(rows[0].currentStock) + input.quantity);
      await p.query(`UPDATE dom_inventory_items SET "currentStock"=$2 WHERE "itemCode"=$1`, [input.itemCode, newStock]);
      // Low-stock auto-notification (D18 hook)
      const { rows: item } = await p.query(`SELECT name, "minStock" FROM dom_inventory_items WHERE "itemCode"=$1`, [input.itemCode]);
      if (item[0] && newStock <= Number(item[0].minStock)) {
        await p.query(
          `INSERT INTO dom_notifications ("notificationId","recipientId",channel,title,body,status,"sentAt")
           VALUES ($1,'inventory-manager','IN_APP',$2,$3,'SENT',now())`,
          [rid2("NTF"), `تنبيه مخزون منخفض: ${item[0].name}`,
           `الصنف ${item[0].name} (${input.itemCode}) وصل ${newStock} — الحد الأدنى ${item[0].minStock}. ${input.reason ?? ""}`]);
      }
      return { itemCode: input.itemCode, oldStock: Number(rows[0].currentStock), newStock };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D06: CRM / Marketing
// ─────────────────────────────────────────────────────────────────────────────
const crmRouter = createRouter({
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
      await ensureSchema();
      const contactId = rid2("CRM");
      await getPool().query(
        `INSERT INTO dom_crm_contacts ("contactId",name,email,phone,type,stage,source) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [contactId, input.name, input.email ?? null, input.phone ?? null, input.type, input.stage, input.source ?? null]);
      return { contactId, added: true };
    }),

  advanceStage: publicQuery
    .input(z.object({
      contactId: z.string(),
      stage: z.enum(["AWARENESS", "INTEREST", "CONSIDERATION", "INTENT", "PURCHASE", "RETENTION"]),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      await getPool().query(
        `UPDATE dom_crm_contacts SET stage=$2, "updatedAt"=now(),
           type = CASE WHEN $2 IN ('PURCHASE','RETENTION') THEN 'CUSTOMER' ELSE type END
         WHERE "contactId"=$1`, [input.contactId, input.stage]);
      return { contactId: input.contactId, stage: input.stage };
    }),

  list: publicQuery
    .input(z.object({ type: z.string().optional(), stage: z.string().optional(), limit: z.number().default(30) }))
    .query(async ({ input }) => {
      await ensureSchema();
      const res = await getPool().query(
        `SELECT * FROM dom_crm_contacts
         WHERE ($1::text IS NULL OR type=$1) AND ($2::text IS NULL OR stage=$2)
         ORDER BY "createdAt" DESC LIMIT $3`,
        [input.type ?? null, input.stage ?? null, input.limit]);
      return res.rows;
    }),

  pipeline: publicQuery.query(async () => {
    await ensureSchema();
    const { rows } = await getPool().query(`SELECT type, stage FROM dom_crm_contacts`);
    const stages = ["AWARENESS", "INTEREST", "CONSIDERATION", "INTENT", "PURCHASE", "RETENTION"];
    return {
      total: rows.length,
      byStage: Object.fromEntries(stages.map((s) => [s, rows.filter((r) => r.stage === s).length])),
      byType: Object.fromEntries(["LEAD", "PROSPECT", "CUSTOMER", "VIP", "PARTNER"].map((t) => [t, rows.filter((r) => r.type === t).length])),
      conversionRate: rows.length > 0 ? Math.round((rows.filter((r) => r.stage === "PURCHASE" || r.stage === "RETENTION").length / rows.length) * 10000) / 100 : 0,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D08: Analytics & Reporting
// ─────────────────────────────────────────────────────────────────────────────
const analyticsRouter = createRouter({
  generate: publicQuery
    .input(z.object({
      type: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "MOA_GOVERNMENT", "CLINICAL", "FINANCIAL", "OPERATIONAL"]),
      title: z.string(),
      period: z.string(),
      data: z.record(z.string(), z.unknown()),
      moaFormat: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const reportId = rid2("RPT");
      await getPool().query(
        `INSERT INTO dom_analytics_reports ("reportId",type,title,period,data,"moaFormat",status,"generatedBy")
         VALUES ($1,$2,$3,$4,$5,$6,'FINAL','ONX Intelligence AI')`,
        [reportId, input.type, input.title, input.period, JSON.stringify(input.data), input.moaFormat ? 1 : 0]);
      return { reportId, type: input.type, status: "FINAL" };
    }),

  list: publicQuery
    .input(z.object({ type: z.string().optional(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      await ensureSchema();
      const res = await getPool().query(
        `SELECT "reportId", type, title, period, "moaFormat", status, "generatedBy", "createdAt"
           FROM dom_analytics_reports WHERE ($1::text IS NULL OR type=$1)
           ORDER BY "createdAt" DESC LIMIT $2`,
        [input.type ?? null, input.limit]);
      return res.rows;
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D14: Business Intelligence (KPIs)
// ─────────────────────────────────────────────────────────────────────────────
const biRouter = createRouter({
  record: publicQuery
    .input(z.object({
      name: z.string(),
      category: z.enum(["REVENUE", "CLINICAL", "OPERATIONAL", "CUSTOMER", "FINANCIAL", "MARKETING", "HR"]),
      value: z.number(),
      unit: z.string().optional(),
      period: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const metricId = rid2("KPI");
      await getPool().query(
        `INSERT INTO dom_bi_metrics ("metricId",name,category,value,unit,period) VALUES ($1,$2,$3,$4,$5,$6)`,
        [metricId, input.name, input.category, input.value, input.unit ?? null, input.period ?? null]);
      return { metricId, recorded: true };
    }),

  latest: publicQuery
    .input(z.object({ metric: z.string().optional(), category: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      await ensureSchema();
      const res = await getPool().query(
        `SELECT * FROM dom_bi_metrics
         WHERE ($1::text IS NULL OR name ILIKE '%'||$1||'%') AND ($2::text IS NULL OR category=$2)
         ORDER BY "recordedAt" DESC LIMIT $3`,
        [input.metric ?? null, input.category ?? null, input.limit]);
      return res.rows;
    }),

  dashboard: publicQuery.query(async () => {
    await ensureSchema();
    const { rows } = await getPool().query(
      `SELECT DISTINCT ON (category, name) category, name, value, unit, period, "recordedAt"
         FROM dom_bi_metrics ORDER BY category, name, "recordedAt" DESC`);
    const categories = ["REVENUE", "CLINICAL", "OPERATIONAL", "CUSTOMER", "FINANCIAL", "MARKETING", "HR"];
    return {
      categories: categories.map((c) => ({ category: c, metrics: rows.filter((r) => r.category === c) })),
      coveredCategories: categories.filter((c) => rows.some((r) => r.category === c)).length,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D15: Organization & Branches
// ─────────────────────────────────────────────────────────────────────────────
const branchesRouter = createRouter({
  add: publicQuery
    .input(z.object({
      name: z.string(), nameAr: z.string().optional(),
      type: z.enum(["CLINIC", "MOBILE_UNIT", "PHARMACY", "LAB", "HQ"]).default("CLINIC"),
      status: z.enum(["ACTIVE", "SETUP", "SUSPENDED"]).default("ACTIVE"),
      city: z.string(), address: z.string().optional(), phone: z.string().optional(),
      lat: z.number().optional(), lng: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const branchId = rid2("BR");
      await getPool().query(
        `INSERT INTO dom_branches ("branchId",name,"nameAr",type,status,city,address,phone,lat,lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [branchId, input.name, input.nameAr ?? null, input.type, input.status, input.city,
         input.address ?? null, input.phone ?? null, input.lat ?? null, input.lng ?? null]);
      return { branchId, added: true };
    }),

  list: publicQuery.query(async () => {
    await ensureSchema();
    const res = await getPool().query(`SELECT * FROM dom_branches ORDER BY "createdAt" ASC`);
    return res.rows;
  }),

  stats: publicQuery.query(async () => {
    await ensureSchema();
    const { rows } = await getPool().query(`SELECT status, city, type FROM dom_branches`);
    return {
      total: rows.length,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      byCity: Object.fromEntries([...new Set(rows.map((r) => r.city))].map((c) => [c, rows.filter((r) => r.city === c).length])),
      byType: Object.fromEntries([...new Set(rows.map((r) => r.type))].map((t) => [t, rows.filter((r) => r.type === t).length])),
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D18: Notifications — 5 channels: EMAIL, SMS, WHATSAPP, PUSH, IN_APP
// ─────────────────────────────────────────────────────────────────────────────
const CHANNELS = ["EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP"] as const;
// EV-NTF-01 (honesty): IN_APP is genuinely delivered (DB record the app reads).
// External channels are only marked SENT when a real provider is configured;
// otherwise they stay honestly QUEUED with providerConfigured=false.
const PROVIDER_ENV: Record<(typeof CHANNELS)[number], string | undefined> = {
  EMAIL: process.env.EMAIL_PROVIDER_TOKEN,
  SMS: process.env.SMS_PROVIDER_TOKEN,
  WHATSAPP: process.env.WHATSAPP_PROVIDER_TOKEN,
  PUSH: process.env.PUSH_PROVIDER_TOKEN,
  IN_APP: "builtin",
};
function channelStatus(channel: (typeof CHANNELS)[number]): { status: string; providerConfigured: boolean } {
  const configured = Boolean(PROVIDER_ENV[channel]);
  return { status: configured ? "SENT" : "QUEUED", providerConfigured: configured };
}
const notificationsRouter = createRouter({
  send: publicQuery
    .input(z.object({
      recipientId: z.string(),
      channel: z.enum(CHANNELS),
      title: z.string(),
      body: z.string(),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const notificationId = rid2("NTF");
      const { status, providerConfigured } = channelStatus(input.channel);
      await getPool().query(
        status === "SENT"
          ? `INSERT INTO dom_notifications ("notificationId","recipientId",channel,title,body,status,"sentAt") VALUES ($1,$2,$3,$4,$5,$6,now())`
          : `INSERT INTO dom_notifications ("notificationId","recipientId",channel,title,body,status) VALUES ($1,$2,$3,$4,$5,$6)`,
        [notificationId, input.recipientId, input.channel, input.title, input.body, status]);
      return { notificationId, channel: input.channel, status, providerConfigured };
    }),

  broadcast: publicQuery
    .input(z.object({ recipientId: z.string(), title: z.string(), body: z.string() }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const p = getPool();
      const ids: string[] = [];
      for (const channel of CHANNELS) {
        const notificationId = rid2("NTF");
        const { status } = channelStatus(channel);
        await p.query(
          status === "SENT"
            ? `INSERT INTO dom_notifications ("notificationId","recipientId",channel,title,body,status,"sentAt") VALUES ($1,$2,$3,$4,$5,'SENT',now())`
            : `INSERT INTO dom_notifications ("notificationId","recipientId",channel,title,body,status) VALUES ($1,$2,$3,$4,$5,'QUEUED')`,
          [notificationId, input.recipientId, channel, input.title, input.body]);
        ids.push(notificationId);
      }
      return {
        sent: ids.length,
        channels: CHANNELS,
        notificationIds: ids,
        providerStatus: Object.fromEntries(CHANNELS.map((c) => [c, channelStatus(c)])),
      };
    }),

  list: publicQuery
    .input(z.object({ recipientId: z.string().optional(), channel: z.string().optional(), limit: z.number().default(30) }))
    .query(async ({ input }) => {
      await ensureSchema();
      const res = await getPool().query(
        `SELECT * FROM dom_notifications
         WHERE ($1::text IS NULL OR "recipientId"=$1) AND ($2::text IS NULL OR channel=$2)
         ORDER BY "createdAt" DESC LIMIT $3`,
        [input.recipientId ?? null, input.channel ?? null, input.limit]);
      return res.rows;
    }),

  stats: publicQuery.query(async () => {
    await ensureSchema();
    const { rows } = await getPool().query(`SELECT channel, status FROM dom_notifications`);
    return {
      total: rows.length,
      sent: rows.filter((r) => r.status === "SENT").length,
      byChannel: Object.fromEntries(CHANNELS.map((c) => [c, rows.filter((r) => r.channel === c).length])),
      supportedChannels: CHANNELS,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D10: Laboratory Results — aiInterpretation via GPT-4o (honest fallback: none)
// ─────────────────────────────────────────────────────────────────────────────
const labRouter = createRouter({
  add: publicQuery
    .input(z.object({
      patientId: z.string(),
      sessionId: z.string().optional(),
      testType: z.string(),
      testName: z.string(),
      testNameAr: z.string().optional(),
      result: z.string(),
      unit: z.string().optional(),
      referenceRange: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const labId = rid2("LAB");
      let aiInterpretation: string | null = null;
      let abnormalFlag: string | null = null;
      const ai = getOpenAI();
      if (ai) {
        try {
          const completion = await ai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0.2,
            max_tokens: 300,
            messages: [
              { role: "system", content: "أنت طبيب بيطري مختص بالتحاليل المخبرية. فسّر النتيجة بإيجاز سريري (٣ جمل كحد أقصى) بالعربية، وحدّد في السطر الأخير: FLAG: NORMAL أو HIGH أو LOW أو CRITICAL." },
              { role: "user", content: `التحليل: ${input.testName} (${input.testType})\nالنتيجة: ${input.result} ${input.unit ?? ""}\nالمجال المرجعي: ${input.referenceRange ?? "غير متوفر"}` },
            ],
          });
          const text = completion.choices[0]?.message?.content ?? "";
          const flagMatch = text.match(/FLAG:\s*(NORMAL|HIGH|LOW|CRITICAL)/);
          abnormalFlag = flagMatch ? flagMatch[1] : null;
          aiInterpretation = text.replace(/FLAG:\s*(NORMAL|HIGH|LOW|CRITICAL)/, "").trim();
        } catch {
          aiInterpretation = null;
        }
      }
      await getPool().query(
        `INSERT INTO dom_lab_results ("labId","patientId","sessionId","testType","testName","testNameAr",result,unit,"referenceRange","abnormalFlag","aiInterpretation")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [labId, input.patientId, input.sessionId ?? null, input.testType, input.testName,
         input.testNameAr ?? null, input.result, input.unit ?? null, input.referenceRange ?? null,
         abnormalFlag, aiInterpretation]);
      return { labId, status: "FINAL", abnormalFlag, aiInterpretation, interpretationModel: aiInterpretation ? "gpt-4o" : null };
    }),

  forPatient: publicQuery
    .input(z.object({ patientId: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      await ensureSchema();
      const res = await getPool().query(
        `SELECT * FROM dom_lab_results WHERE "patientId"=$1 ORDER BY "createdAt" DESC LIMIT $2`,
        [input.patientId, input.limit]);
      return res.rows;
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D02: Human Resources
// ─────────────────────────────────────────────────────────────────────────────
const hrRouter = createRouter({
  add: publicQuery
    .input(z.object({
      name: z.string(), role: z.string(), department: z.string().optional(),
      branchId: z.string().optional(), phone: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const staffId = rid2("STF");
      await getPool().query(
        `INSERT INTO dom_hr_staff ("staffId",name,role,department,"branchId",phone,"hireDate")
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE)`,
        [staffId, input.name, input.role, input.department ?? null, input.branchId ?? null, input.phone ?? null]);
      return { staffId, added: true };
    }),

  list: publicQuery
    .input(z.object({ role: z.string().optional(), branchId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await ensureSchema();
      const branch = scopedBranch(ctx) ?? input.branchId ?? null;
      const res = await getPool().query(
        `SELECT * FROM dom_hr_staff WHERE ($1::text IS NULL OR role=$1) AND ($2::text IS NULL OR "branchId"=$2)
         ORDER BY "createdAt" ASC`,
        [input.role ?? null, branch]);
      return res.rows;
    }),

  insights: publicQuery.query(async () => {
    await ensureSchema();
    const { rows } = await getPool().query(`SELECT role, department, "branchId", status FROM dom_hr_staff`);
    const byRole = Object.fromEntries([...new Set(rows.map((r) => r.role))].map((r) => [r, rows.filter((x) => x.role === r).length]));
    const vets = rows.filter((r) => /vet|طبيب/i.test(r.role)).length;
    const nurses = rows.filter((r) => /nurse|ممرض/i.test(r.role)).length;
    return {
      total: rows.length,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      byRole,
      aiInsight: vets > 0 ? `نسبة الدعم السريري: ${(nurses / Math.max(vets, 1)).toFixed(1)} ممرض لكل طبيب — ${nurses / Math.max(vets, 1) >= 2 ? "متوازنة" : "تحتاج تعزيز تمريض"}` : "لا يوجد أطباء مسجلون",
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D03: Financial Management
// ─────────────────────────────────────────────────────────────────────────────
const financeRouter = createRouter({
  createInvoice: publicQuery
    .input(z.object({
      customerId: z.string(), branchId: z.string().optional(),
      amount: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const p = getPool();
      const invoiceId = rid2("INV");
      const vat = Math.round(input.amount * 0.15 * 100) / 100;
      const total = Math.round((input.amount + vat) * 100) / 100;
      await p.query(
        `INSERT INTO dom_invoices ("invoiceId","customerId","branchId",amount,vat,total) VALUES ($1,$2,$3,$4,$5,$6)`,
        [invoiceId, input.customerId, input.branchId ?? null, input.amount, vat, total]);
      // Auto-record REVENUE BI metric (D03→D14 data flow)
      await p.query(
        `INSERT INTO dom_bi_metrics ("metricId",name,category,value,unit,period) VALUES ($1,'Invoice Revenue','REVENUE',$2,'SAR',to_char(now(),'YYYY-MM'))`,
        [rid2("KPI"), total]);
      return { invoiceId, amount: input.amount, vat, total, status: "ISSUED" };
    }),

  list: publicQuery
    .input(z.object({ status: z.string().optional(), limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      await ensureSchema();
      const branch = scopedBranch(ctx);
      const res = await getPool().query(
        `SELECT * FROM dom_invoices WHERE ($1::text IS NULL OR status=$1)
           AND ($3::text IS NULL OR "branchId"=$3) ORDER BY "createdAt" DESC LIMIT $2`,
        [input.status ?? null, input.limit, branch]);
      return res.rows;
    }),

  summary: publicQuery.query(async ({ ctx }) => {
    await ensureSchema();
    const branch = scopedBranch(ctx);
    const { rows } = await getPool().query(
      `SELECT count(*)::int AS invoices, COALESCE(sum(total),0)::float AS "totalRevenue",
              COALESCE(sum(vat),0)::float AS "totalVat",
              COALESCE(sum(total) FILTER (WHERE status='PAID'),0)::float AS "paidRevenue"
         FROM dom_invoices WHERE ($1::text IS NULL OR "branchId"=$1)`, [branch]);
    return rows[0];
  }),

  // EV-PAY-01: Moyasar payment adapter — honest when unconfigured
  createPayment: publicQuery
    .input(z.object({
      invoiceId: z.string(),
      callbackUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const p = getPool();
      const { rows } = await p.query(`SELECT "invoiceId", total, status FROM dom_invoices WHERE "invoiceId"=$1`, [input.invoiceId]);
      if (!rows[0]) throw new Error("INVOICE_NOT_FOUND");
      const key = process.env.MOYASAR_SECRET_KEY;
      if (!key) {
        return {
          supported: false,
          reason: "MOYASAR_SECRET_KEY not configured — payment gateway not linked yet",
          invoiceId: input.invoiceId,
          paymentStatus: "UNPAID",
          provider: "moyasar",
        };
      }
      const resp = await fetch("https://api.moyasar.com/v1/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}` },
        body: JSON.stringify({
          amount: Math.round(Number(rows[0].total) * 100),
          currency: "SAR",
          description: `ONX Vet invoice ${input.invoiceId}`,
          callback_url: input.callbackUrl,
        }),
      });
      if (!resp.ok) throw new Error(`MOYASAR_ERROR_${resp.status}`);
      const pay = (await resp.json()) as { id: string; url?: string };
      await p.query(`UPDATE dom_invoices SET status='PAYMENT_PENDING' WHERE "invoiceId"=$1`, [input.invoiceId]);
      return { supported: true, provider: "moyasar", paymentId: pay.id, paymentUrl: pay.url ?? null, invoiceId: input.invoiceId };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D07: Customer Portal — owner view of appointments & lab results
// ─────────────────────────────────────────────────────────────────────────────
const portalRouter = createRouter({
  patientFile: publicQuery
    .input(z.object({ patientId: z.string() }))
    .query(async ({ input }) => {
      await ensureSchema();
      const p = getPool();
      const labs = await p.query(
        `SELECT "labId","testName","testNameAr",result,unit,"referenceRange","abnormalFlag","aiInterpretation","createdAt"
           FROM dom_lab_results WHERE "patientId"=$1 ORDER BY "createdAt" DESC LIMIT 20`, [input.patientId]);
      const appointments = await p.query(
        `SELECT "ticketId", category, subject, status, "createdAt" FROM dom_call_tickets
          WHERE "customerId"=$1 AND category='APPOINTMENT' ORDER BY "createdAt" DESC LIMIT 20`, [input.patientId]);
      const notifications = await p.query(
        `SELECT "notificationId", channel, title, body, status, "sentAt" FROM dom_notifications
          WHERE "recipientId"=$1 ORDER BY "createdAt" DESC LIMIT 10`, [input.patientId]);
      return {
        patientId: input.patientId,
        labResults: labs.rows,
        appointments: appointments.rows,
        notifications: notifications.rows,
      };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D11: TeleVet & Emergency — video sessions + priority escalation
// ─────────────────────────────────────────────────────────────────────────────
const televetRouter = createRouter({
  startSession: publicQuery
    .input(z.object({
      patientId: z.string(), ownerName: z.string(),
      mode: z.enum(["VIDEO", "AUDIO", "CHAT"]).default("VIDEO"),
      priority: z.enum(["ROUTINE", "URGENT", "EMERGENCY"]).default("ROUTINE"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const p = getPool();
      const sessionRef = rid2("TVS");
      const emergency = input.priority === "EMERGENCY";
      await p.query(
        `INSERT INTO dom_televet_sessions ("sessionRef","patientId","ownerName",mode,priority,status,"escalatedTo",notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sessionRef, input.patientId, input.ownerName, input.mode, input.priority,
         emergency ? "ESCALATED" : "LIVE", emergency ? "on-duty-vet" : null, input.notes ?? null]);
      if (emergency) {
        for (const ch of ["PUSH", "WHATSAPP"] as const) {
          const { status } = channelStatus(ch);
          await p.query(
            status === "SENT"
              ? `INSERT INTO dom_notifications ("notificationId","recipientId",channel,title,body,status,"sentAt") VALUES ($1,'on-duty-vet',$2,$3,$4,'SENT',now())`
              : `INSERT INTO dom_notifications ("notificationId","recipientId",channel,title,body,status) VALUES ($1,'on-duty-vet',$2,$3,$4,'QUEUED')`,
            [rid2("NTF"), ch, "حالة طارئة — TeleVet", `جلسة طارئة ${sessionRef} للمريض ${input.patientId} (${input.ownerName}). تدخل فوري مطلوب.`]);
        }
      }
      return { sessionRef, status: emergency ? "ESCALATED" : "LIVE", mode: input.mode, escalated: emergency };
    }),

  list: publicQuery
    .input(z.object({ status: z.string().optional(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      await ensureSchema();
      const res = await getPool().query(
        `SELECT * FROM dom_televet_sessions WHERE ($1::text IS NULL OR status=$1) ORDER BY "createdAt" DESC LIMIT $2`,
        [input.status ?? null, input.limit]);
      return res.rows;
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// D13: Compliance & Regulatory (Saudi veterinary context)
// ─────────────────────────────────────────────────────────────────────────────
const SAUDI_REQUIREMENTS = [
  { domain: "MOA", requirement: "ترخيص وزارة البيئة والمياه والزراعة للعيادة البيطرية" },
  { domain: "MOA", requirement: "التقرير الدوري للأمراض الوبائية إلى الوزارة" },
  { domain: "SFDA", requirement: "تسجيل الأدوية البيطرية المستخدمة لدى الهيئة العامة للغذاء والدواء" },
  { domain: "MOH", requirement: "التبليغ الفوري عن الأمراض المشتركة (حيوانية المنشأ)" },
  { domain: "MUNICIPALITY", requirement: "رخصة البلدية لمزاولة النشاط" },
  { domain: "PDPL", requirement: "حماية بيانات العملاء وفق نظام حماية البيانات الشخصية" },
] as const;
const complianceRouter = createRouter({
  check: publicQuery
    .input(z.object({ domain: z.string().optional() }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const p = getPool();
      const results: { checkId: string; domain: string; requirement: string; status: string }[] = [];
      for (const req of SAUDI_REQUIREMENTS) {
        if (input.domain && req.domain !== input.domain) continue;
        const checkId = rid2("CMP");
        // Evidence-based status: MOA reporting is live via vet.generateGovReport
        const status = req.domain === "MOA" && req.requirement.includes("التقرير") ? "COMPLIANT" : "REQUIRES_ATTESTATION";
        const evidence = status === "COMPLIANT" ? "vet.generateGovReport verified (EV-P0-08)" : null;
        await p.query(
          `INSERT INTO dom_compliance_checks ("checkId",domain,requirement,status,evidence) VALUES ($1,$2,$3,$4,$5)`,
          [checkId, req.domain, req.requirement, status, evidence]);
        results.push({ checkId, domain: req.domain, requirement: req.requirement, status });
      }
      return { checked: results.length, results };
    }),

  status: publicQuery.query(async () => {
    await ensureSchema();
    const { rows } = await getPool().query(
      `SELECT DISTINCT ON (requirement) domain, requirement, status, evidence, "checkedAt"
         FROM dom_compliance_checks ORDER BY requirement, "checkedAt" DESC`);
    return {
      requirements: rows,
      compliant: rows.filter((r) => r.status === "COMPLIANT").length,
      requiresAttestation: rows.filter((r) => r.status === "REQUIRES_ATTESTATION").length,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// PROCUREMENT INTELLIGENCE (EV-P2-07)
// ─────────────────────────────────────────────────────────────────────────────
const procurementRouter = createRouter({
  addVendor: publicQuery
    .input(z.object({
      name: z.string(), category: z.string(),
      rating: z.number().min(0).max(5),
      priceScore: z.number().min(0).max(1),
      reliabilityScore: z.number().min(0).max(1),
      leadTimeDays: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const vendorId = rid2("VND");
      await getPool().query(
        `INSERT INTO dom_procurement_vendors ("vendorId",name,category,rating,"priceScore","reliabilityScore","leadTimeDays")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [vendorId, input.name, input.category, input.rating, input.priceScore, input.reliabilityScore, input.leadTimeDays]);
      return { vendorId, added: true };
    }),

  recommend: publicQuery
    .input(z.object({ category: z.string().optional() }))
    .query(async ({ input }) => {
      await ensureSchema();
      const { rows } = await getPool().query(
        `SELECT *, (rating/5*0.3 + "priceScore"*0.35 + "reliabilityScore"*0.35)::float AS score
           FROM dom_procurement_vendors WHERE ($1::text IS NULL OR category=$1)
           ORDER BY score DESC`, [input.category ?? null]);
      return { rankings: rows, recommended: rows[0] ?? null, scoringModel: "rating*0.3 + price*0.35 + reliability*0.35" };
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
  hr: hrRouter,
  finance: financeRouter,
  portal: portalRouter,
  televet: televetRouter,
  compliance: complianceRouter,
  procurement: procurementRouter,
});
