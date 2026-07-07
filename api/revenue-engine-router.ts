// =============================================================================
// REVENUE ENGINE ROUTER — P0-06: Auto Revenue Target Calculation
// Service pricing, appointment-based revenue, ZATCA readiness, daily/monthly targets
// =============================================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";

// ─────────────────────────────────────────────────────────────────────────────
// Service Pricing Table (Veterinary Clinic)
// ─────────────────────────────────────────────────────────────────────────────

interface Service {
  id: string;
  name: string;
  nameAr: string;
  category: "CONSULTATION" | "VACCINATION" | "SURGERY" | "DIAGNOSTIC" | "GROOMING" | "EMERGENCY";
  priceBase: number; // SAR
  priceUrgent: number; // SAR (mobile clinic surcharge)
  vatRate: number; // 0.15 for ZATCA
  duration: number; // minutes
}

const SERVICES: Service[] = [
  { id: "SVC-001", name: "General Consultation", nameAr: "استشارة عامة", category: "CONSULTATION", priceBase: 200, priceUrgent: 300, vatRate: 0.15, duration: 30 },
  { id: "SVC-002", name: "Vaccination (Dog)", nameAr: "تطعيم كلاب", category: "VACCINATION", priceBase: 150, priceUrgent: 200, vatRate: 0.15, duration: 20 },
  { id: "SVC-003", name: "Vaccination (Cat)", nameAr: "تطعيم قطط", category: "VACCINATION", priceBase: 120, priceUrgent: 170, vatRate: 0.15, duration: 15 },
  { id: "SVC-004", name: "Minor Surgery", nameAr: "جراحة بسيطة", category: "SURGERY", priceBase: 800, priceUrgent: 1200, vatRate: 0.15, duration: 90 },
  { id: "SVC-005", name: "Blood Test", nameAr: "فحص دم", category: "DIAGNOSTIC", priceBase: 250, priceUrgent: 350, vatRate: 0.15, duration: 20 },
  { id: "SVC-006", name: "X-Ray", nameAr: "أشعة سينية", category: "DIAGNOSTIC", priceBase: 400, priceUrgent: 550, vatRate: 0.15, duration: 30 },
  { id: "SVC-007", name: "Grooming (Dog)", nameAr: "عناية كلاب", category: "GROOMING", priceBase: 180, priceUrgent: 250, vatRate: 0.15, duration: 60 },
  { id: "SVC-008", name: "Emergency Visit", nameAr: "زيارة طارئة", category: "EMERGENCY", priceBase: 500, priceUrgent: 700, vatRate: 0.15, duration: 45 },
  { id: "SVC-009", name: "Dental Cleaning", nameAr: "تنظيف أسنان", category: "GROOMING", priceBase: 300, priceUrgent: 400, vatRate: 0.15, duration: 45 },
  { id: "SVC-010", name: "Ultrasound", nameAr: "موجات صوتية", category: "DIAGNOSTIC", priceBase: 350, priceUrgent: 480, vatRate: 0.15, duration: 25 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Simulated Transaction Data (30 days pilot data)
// ─────────────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  serviceId: string;
  vehicleId: string;
  branchId: string;
  date: Date;
  amount: number;
  vat: number;
  total: number;
  isUrgent: boolean;
  clientId: string;
  zatcaStatus: "PENDING" | "SUBMITTED" | "APPROVED";
}

function generateTransactions(): Transaction[] {
  const txns: Transaction[] = [];
  const now = new Date();
  let txId = 1000;

  for (let day = 29; day >= 0; day--) {
    const date = new Date(now.getTime() - day * 86400000);
    const dailyCount = 8 + Math.floor(Math.random() * 12); // 8-20 per day

    for (let i = 0; i < dailyCount; i++) {
      const svc = SERVICES[Math.floor(Math.random() * SERVICES.length)];
      const isUrgent = Math.random() > 0.7;
      const price = isUrgent ? svc.priceUrgent : svc.priceBase;
      const vat = Math.round(price * svc.vatRate * 100) / 100;

      txns.push({
        id: `TXN-${txId++}`,
        serviceId: svc.id,
        vehicleId: `MC-00${1 + Math.floor(Math.random() * 5)}`,
        branchId: `BR-00${1 + Math.floor(Math.random() * 3)}`,
        date,
        amount: price,
        vat,
        total: price + vat,
        isUrgent,
        clientId: `CLI-${100 + Math.floor(Math.random() * 500)}`,
        zatcaStatus: day > 3 ? "APPROVED" : day > 0 ? "SUBMITTED" : "PENDING",
      });
    }
  }
  return txns;
}

const transactions = generateTransactions();

// ─────────────────────────────────────────────────────────────────────────────
// Revenue Calculation Engine
// ─────────────────────────────────────────────────────────────────────────────

function getDailyRevenue(date: Date): { amount: number; vat: number; total: number; count: number } {
  const d = date.toDateString();
  const dayTxns = transactions.filter((t) => t.date.toDateString() === d);
  return {
    amount: Math.round(dayTxns.reduce((s, t) => s + t.amount, 0) * 100) / 100,
    vat: Math.round(dayTxns.reduce((s, t) => s + t.vat, 0) * 100) / 100,
    total: Math.round(dayTxns.reduce((s, t) => s + t.total, 0) * 100) / 100,
    count: dayTxns.length,
  };
}

function computeTargets(monthlyTarget: number) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const dailyTarget = monthlyTarget / daysInMonth;

  // This month's actual
  const monthTxns = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const actualToDate = monthTxns.reduce((s, t) => s + t.total, 0);
  const expectedToDate = dailyTarget * dayOfMonth;
  const variance = actualToDate - expectedToDate;
  const projectedMonthly = (actualToDate / dayOfMonth) * daysInMonth;

  return {
    monthlyTarget,
    dailyTarget: Math.round(dailyTarget * 100) / 100,
    actualToDate: Math.round(actualToDate * 100) / 100,
    expectedToDate: Math.round(expectedToDate * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    variancePercent: Math.round((variance / expectedToDate) * 10000) / 100,
    projectedMonthly: Math.round(projectedMonthly * 100) / 100,
    achievementRate: Math.round((actualToDate / monthlyTarget) * 10000) / 100,
    daysRemaining: daysInMonth - dayOfMonth,
    onTrack: projectedMonthly >= monthlyTarget * 0.9,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Revenue Router
// ─────────────────────────────────────────────────────────────────────────────

export const revenueEngineRouter = createRouter({
  // REV-01: services — Service catalog with pricing
  services: publicQuery.query(() =>
    SERVICES.map((s) => ({
      id: s.id,
      name: s.name,
      nameAr: s.nameAr,
      category: s.category,
      priceBase: s.priceBase,
      priceUrgent: s.priceUrgent,
      totalWithVat: Math.round(s.priceBase * (1 + s.vatRate) * 100) / 100,
      vatRate: s.vatRate,
      duration: s.duration,
    }))
  ),

  // REV-02: daily — Today's revenue
  daily: publicQuery
    .input(z.object({ date: z.string().optional() }))
    .query(({ input }) => {
      const date = input.date ? new Date(input.date) : new Date();
      const revenue = getDailyRevenue(date);
      const yesterday = getDailyRevenue(new Date(date.getTime() - 86400000));
      const growth = yesterday.total > 0 ? ((revenue.total - yesterday.total) / yesterday.total) * 100 : 0;
      return { ...revenue, date: date.toDateString(), growth: Math.round(growth * 100) / 100 };
    }),

  // REV-03: monthly — Monthly summary with 30-day breakdown
  monthly: publicQuery.query(() => {
    const now = new Date();
    const days: Array<{ date: string; amount: number; total: number; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const rev = getDailyRevenue(d);
      days.push({ date: d.toLocaleDateString("ar-SA"), amount: rev.amount, total: rev.total, count: rev.count });
    }
    const totalRevenue = days.reduce((s, d) => s + d.total, 0);
    const totalTransactions = days.reduce((s, d) => s + d.count, 0);
    const avgDailyRevenue = totalRevenue / 30;
    return {
      period: "آخر 30 يوم",
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalTransactions,
      avgDailyRevenue: Math.round(avgDailyRevenue * 100) / 100,
      days,
    };
  }),

  // REV-04: targets — Auto-compute revenue targets (P0-06 core)
  targets: publicQuery
    .input(z.object({ monthlyTarget: z.number().min(1000).default(150000) }))
    .query(({ input }) => computeTargets(input.monthlyTarget)),

  // REV-05: byService — Revenue breakdown by service type
  byService: publicQuery.query(() => {
    const breakdown: Record<string, { name: string; nameAr: string; count: number; revenue: number; vat: number }> = {};
    for (const svc of SERVICES) {
      breakdown[svc.id] = { name: svc.name, nameAr: svc.nameAr, count: 0, revenue: 0, vat: 0 };
    }
    for (const txn of transactions) {
      if (breakdown[txn.serviceId]) {
        breakdown[txn.serviceId].count++;
        breakdown[txn.serviceId].revenue += txn.amount;
        breakdown[txn.serviceId].vat += txn.vat;
      }
    }
    return Object.values(breakdown)
      .map((b) => ({ ...b, revenue: Math.round(b.revenue * 100) / 100, vat: Math.round(b.vat * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);
  }),

  // REV-06: byBranch — Revenue by branch
  byBranch: publicQuery.query(() => {
    const branches: Record<string, { revenue: number; vat: number; count: number }> = {};
    for (const txn of transactions) {
      branches[txn.branchId] ??= { revenue: 0, vat: 0, count: 0 };
      branches[txn.branchId].revenue += txn.amount;
      branches[txn.branchId].vat += txn.vat;
      branches[txn.branchId].count++;
    }
    return Object.entries(branches).map(([id, data]) => ({
      branchId: id,
      revenue: Math.round(data.revenue * 100) / 100,
      vat: Math.round(data.vat * 100) / 100,
      total: Math.round((data.revenue + data.vat) * 100) / 100,
      transactions: data.count,
    })).sort((a, b) => b.revenue - a.revenue);
  }),

  // REV-07: zatca — ZATCA e-invoicing status
  zatca: publicQuery.query(() => {
    const approved = transactions.filter((t) => t.zatcaStatus === "APPROVED").length;
    const submitted = transactions.filter((t) => t.zatcaStatus === "SUBMITTED").length;
    const pending = transactions.filter((t) => t.zatcaStatus === "PENDING").length;
    const totalVat = transactions.reduce((s, t) => s + t.vat, 0);
    return {
      approved, submitted, pending,
      complianceRate: Math.round((approved / transactions.length) * 10000) / 100,
      totalVatCollected: Math.round(totalVat * 100) / 100,
      zatcaPhase: "Phase 2 — E-Invoice Integration",
      nextSubmission: new Date(Date.now() + 86400000).toLocaleDateString("ar-SA"),
    };
  }),

  // REV-08: stats — Summary dashboard stats
  stats: publicQuery.query(() => {
    const today = getDailyRevenue(new Date());
    const targets = computeTargets(150000);
    const totalVat = Math.round(transactions.reduce((s, t) => s + t.vat, 0) * 100) / 100;
    return {
      todayRevenue: today.total,
      todayTransactions: today.count,
      monthlyAchievement: targets.achievementRate,
      projectedMonthly: targets.projectedMonthly,
      onTrack: targets.onTrack,
      totalVatCollected: totalVat,
      avgTransactionValue: Math.round((transactions.reduce((s, t) => s + t.total, 0) / transactions.length) * 100) / 100,
      urgentSurchargeRevenue: Math.round(transactions.filter((t) => t.isUrgent).reduce((s, t) => s + (t.amount - SERVICES.find((s) => s.id === t.serviceId)?.priceBase! || 0), 0) * 100) / 100,
    };
  }),
});
