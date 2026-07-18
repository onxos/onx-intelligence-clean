// ============================================================
// OCPP — ONX CIVILIZATIONAL PROSPERITY PROGRAM
// Day 8: Program 2 of 6 — Flourishing metrics + prosperity tracking
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";

interface ProsperityDimension {
  name: string;
  nameAr: string;
  score: number; // 0-1
  weight: number;
  trend: "UP" | "STABLE" | "DOWN";
}

const dimensions: ProsperityDimension[] = [
  { name: "Economic", nameAr: "اقتصادي", score: 0.72, weight: 0.20, trend: "UP" },
  { name: "Knowledge", nameAr: "معرفي", score: 0.85, weight: 0.20, trend: "UP" },
  { name: "Social", nameAr: "اجتماعي", score: 0.68, weight: 0.15, trend: "STABLE" },
  { name: "Spiritual", nameAr: "روحي", score: 0.91, weight: 0.15, trend: "UP" },
  { name: "Health", nameAr: "صحي", score: 0.76, weight: 0.15, trend: "STABLE" },
  { name: "Environmental", nameAr: "بيئي", score: 0.54, weight: 0.07, trend: "DOWN" },
  { name: "Governance", nameAr: "حوكمة", score: 0.88, weight: 0.05, trend: "UP" },
  { name: "Technological", nameAr: "تقني", score: 0.81, weight: 0.02, trend: "UP" },
  { name: "Educational", nameAr: "تعليمي", score: 0.74, weight: 0.01, trend: "UP" },
];

export const ocppRouter = createRouter({
  measure: publicQuery.query(() => {
    const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
    const prosperityIndex = dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight;
    return {
      index: Math.round(prosperityIndex * 1000) / 1000,
      grade: prosperityIndex >= 0.8 ? "A" : prosperityIndex >= 0.6 ? "B" : prosperityIndex >= 0.4 ? "C" : "D",
      dimensions: dimensions.map((d) => ({
        name: d.name,
        nameAr: d.nameAr,
        score: d.score,
        weighted: Math.round(d.score * d.weight * 1000) / 1000,
        trend: d.trend,
      })),
      timestamp: new Date().toISOString(),
    };
  }),

  update: publicQuery
    .input(z.object({
      dimension: z.string(),
      score: z.number().min(0).max(1),
    }))
    .mutation(({ input }) => {
      const dim = dimensions.find((d) => d.name === input.dimension);
      if (!dim) throw new Error("DIMENSION_NOT_FOUND");
      const prev = dim.score;
      dim.score = input.score;
      dim.trend = input.score > prev + 0.05 ? "UP" : input.score < prev - 0.05 ? "DOWN" : "STABLE";
      return { updated: true, dimension: input.dimension, previous: prev, current: input.score };
    }),

  compare: publicQuery
    .input(z.object({
      baseline: z.record(z.string(), z.number()).optional(),
    }))
    .query(({ input }) => {
      const current = dimensions.reduce((s, d) => s + d.score * d.weight, 0);
      if (!input.baseline) return { current, delta: 0 };
      const baselineTotal = Object.entries(input.baseline).reduce((s, [name, score]) => {
        const dim = dimensions.find((d) => d.name === name);
        return s + (score * (dim?.weight || 0.1));
      }, 0);
      return { current, baseline: baselineTotal, delta: Math.round((current - baselineTotal) * 1000) / 1000 };
    }),

  benchmark: publicQuery.query(() => ({
    benchmarks: [
      { entity: "ONX Current", score: 0.76 },
      { entity: "Silicon Valley Avg", score: 0.72 },
      { entity: "Islamic Golden Age", score: 0.91 },
      { entity: "OECD Average", score: 0.68 },
      { entity: "Target 2030", score: 0.85 },
    ],
    onxRank: 2,
  })),

  report: publicQuery.query(() => {
    const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0];
    const strongest = [...dimensions].sort((a, b) => b.score - a.score)[0];
    return {
      summary: `Prosperity index at ${Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0) * 100)}% — ${strongest.nameAr} strongest, ${weakest.nameAr} needs attention`,
      strongest: { name: strongest.name, nameAr: strongest.nameAr, score: strongest.score },
      weakest: { name: weakest.name, nameAr: weakest.nameAr, score: weakest.score },
      recommendations: [
        `Invest in ${weakest.nameAr} dimension — current score ${weakest.score}`,
        "Leverage Knowledge dimension strength for cross-domain impact",
        "Maintain Spiritual dimension leadership through continued Ihsan",
      ],
    };
  }),
});
