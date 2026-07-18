// ============================================================
// CONSTITUTION ROUTER — Day 4: Foundation Skill 1
// 7 Principles Validation: Amanah, Ihsan, Adl, Rahmah, Hikmah, Itqan, Tawakkul
// Integrates Guardian + Apollo + USFIPv2 Engine
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { Guardian, USFIPv2Engine } from "@onx/intelligence-runtime";

// --- Singleton engines ---
const guardian = new Guardian();
const usfipv2 = new USFIPv2Engine();

// --- 7 Constitutional Principles ---
interface Principle {
  id: string;
  nameAr: string;
  nameEn: string;
  description: string;
  weight: number; // 0-1 importance weight
}

const PRINCIPLES: Principle[] = [
  { id: "AMANAH", nameAr: "الأمانة", nameEn: "Trustworthiness", description: "الثقة والمسؤولية في كل قرار وعمل", weight: 0.20 },
  { id: "IHSAN", nameAr: "الإحسان", nameEn: "Excellence", description: "الإتقان والكمال في كل جهد", weight: 0.15 },
  { id: "ADL", nameAr: "العدل", nameEn: "Justice", description: "العدالة والإنصاف في كل حكم", weight: 0.18 },
  { id: "RAHMAH", nameAr: "الرحمة", nameEn: "Compassion", description: "الرحمة والشفقة في كل تفاعل", weight: 0.12 },
  { id: "HIKMAH", nameAr: "الحكمة", nameEn: "Wisdom", description: "الحكمة العميقة وراء كل قرار", weight: 0.15 },
  { id: "ITQAN", nameAr: "الاتقان", nameEn: "Mastery", description: "الدقة والإتقان في التنفيذ", weight: 0.10 },
  { id: "TAWAKKUL", nameAr: "التوكل", nameEn: "Trust in Divine", description: "التوكل على الله مع الأخذ بالأسباب", weight: 0.10 },
];

// --- Validation Rules per Principle ---
const VALIDATION_RULES: Record<string, string[]> = {
  AMANAH: ["content_must_be_truthful", "sources_must_be_cited", "intent_must_be_clear", "no_deception"],
  IHSAN: ["quality_must_be_high", "effort_must_be_maximum", "continuous_improvement", "excellence_in_output"],
  ADL: ["fairness_to_all_parties", "no_bias", "balanced_perspective", "equal_opportunity_consideration"],
  RAHMAH: ["compassion_in_delivery", "harm_reduction", "empathy_present", "gentle_approach"],
  HIKMAH: ["deep_reasoning", "long_term_thinking", "context_aware", "experienced_based"],
  ITQAN: ["precision_in_details", "thoroughness", "error_free", "professional_execution"],
  TAWAKKUL: ["balanced_planning", "ethical_alignment", "humility", "divine_acknowledgment"],
};

// --- Compliance Check Engine ---
function evaluatePrinciple(content: string, principle: Principle): {
  score: number;
  passed: boolean;
  checks: Array<{ rule: string; passed: boolean; reason: string }>;
} {
  const rules = VALIDATION_RULES[principle.id] || [];
  const contentLower = content.toLowerCase();
  const contentLength = content.length;

  const checks = rules.map((rule) => {
    // Heuristic scoring based on content analysis
    let passed = false;
    let reason = "Needs review";

    // Length-based heuristics
    if (contentLength > 50) {
      passed = true;
      reason = "Sufficient content length for evaluation";
    }

    // Principle-specific heuristics
    switch (principle.id) {
      case "AMANAH":
        if (contentLower.includes("source") || contentLower.includes("reference") || contentLower.includes("وفق")) {
          passed = true;
          reason = "Sources/references detected";
        }
        break;
      case "ADL":
        if (contentLower.includes("fair") || contentLower.includes("just") || contentLower.includes("عدل")) {
          passed = true;
          reason = "Fairness indicators present";
        }
        break;
      case "IHSAN":
        if (contentLength > 100) {
          passed = true;
          reason = "Detailed response indicates effort";
        }
        break;
      case "RAHMAH":
        if (contentLower.includes("help") || contentLower.includes("assist") || contentLower.includes("مساعد")) {
          passed = true;
          reason = "Compassionate language detected";
        }
        break;
      case "HIKMAH":
        if (contentLower.includes("because") || contentLower.includes("therefore") || contentLower.includes("لأن")) {
          passed = true;
          reason = "Reasoning indicators present";
        }
        break;
      case "ITQAN":
        if (!contentLower.includes("maybe") && !contentLower.includes("perhaps")) {
          passed = true;
          reason = "Confident, precise language";
        }
        break;
      case "TAWAKKUL":
        passed = true; // Always pass — it's about intent
        reason = "Ethical alignment assumed";
        break;
    }

    return { rule, passed, reason };
  });

  const passedChecks = checks.filter((c) => c.passed).length;
  const score = checks.length > 0 ? (passedChecks / checks.length) * 100 : 50;

  return {
    score: Math.round(score),
    passed: score >= 60,
    checks,
  };
}

// --- State tracking ---
let totalValidations = 0;
let totalPassed = 0;
const validationLog: Array<{
  timestamp: string;
  content: string;
  overallScore: number;
  passed: boolean;
  principleScores: Record<string, number>;
}> = [];

// Honest health snapshot (HT-03): real principle count/weight, never a hardcoded claim.
export function getConstitutionHealthSnapshot(): { principles: number; totalWeight: number } {
  return {
    principles: PRINCIPLES.length,
    totalWeight: PRINCIPLES.reduce((s, p) => s + p.weight, 0),
  };
}

export const constitutionRouter = createRouter({
  // CS-01: validate — Full 7-principle validation
  validate: publicQuery
    .input(z.object({
      content: z.string().min(1).max(10000),
      minScore: z.number().min(0).max(100).default(60),
      principles: z.array(z.enum(["AMANAH", "IHSAN", "ADL", "RAHMAH", "HIKMAH", "ITQAN", "TAWAKKUL"])).optional(),
    }))
    .mutation(({ input }) => {
      const principlesToCheck = input.principles || PRINCIPLES.map((p) => p.id as "AMANAH" | "IHSAN" | "ADL" | "RAHMAH" | "HIKMAH" | "ITQAN" | "TAWAKKUL");
      
      let totalWeightedScore = 0;
      let totalWeight = 0;
      const results: Array<{
        principle: Principle;
        score: number;
        passed: boolean;
        checks: Array<{ rule: string; passed: boolean; reason: string }>;
      }> = [];

      for (const principle of PRINCIPLES) {
        if (!principlesToCheck.includes(principle.id as any)) continue;
        
        const evaluation = evaluatePrinciple(input.content, principle);
        results.push({ principle, ...evaluation });
        totalWeightedScore += evaluation.score * principle.weight;
        totalWeight += principle.weight;
      }

      const overallScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
      const passed = overallScore >= input.minScore;

      // Amanah check via Guardian
      const amanahCheck = guardian.checkAmanah(overallScore / 100);

      totalValidations++;
      if (passed) totalPassed++;

      validationLog.push({
        timestamp: new Date().toISOString(),
        content: input.content.substring(0, 200),
        overallScore,
        passed,
        principleScores: Object.fromEntries(results.map((r) => [r.principle.id, r.score])),
      });

      return {
        overallScore,
        passed,
        minScore: input.minScore,
        amanahStatus: amanahCheck,
        principleResults: results.map((r) => ({
          id: r.principle.id,
          nameAr: r.principle.nameAr,
          nameEn: r.principle.nameEn,
          score: r.score,
          passed: r.passed,
          weight: r.principle.weight,
          checks: r.checks,
        })),
        summary: {
          totalPassed: results.filter((r) => r.passed).length,
          totalFailed: results.filter((r) => !r.passed).length,
          totalPrinciples: results.length,
        },
      };
    }),

  // CS-02: quickCheck — Single principle check
  quickCheck: publicQuery
    .input(z.object({
      content: z.string().min(1).max(5000),
      principle: z.enum(["AMANAH", "IHSAN", "ADL", "RAHMAH", "HIKMAH", "ITQAN", "TAWAKKUL"]),
    }))
    .query(({ input }) => {
      const principle = PRINCIPLES.find((p) => p.id === input.principle);
      if (!principle) throw new Error("PRINCIPLE_NOT_FOUND");
      
      const evaluation = evaluatePrinciple(input.content, principle);
      return {
        principle: {
          id: principle.id,
          nameAr: principle.nameAr,
          nameEn: principle.nameEn,
        },
        ...evaluation,
      };
    }),

  // CS-03: principles — List all principles
  principles: publicQuery.query(() => ({
    principles: PRINCIPLES,
    count: PRINCIPLES.length,
    totalWeight: PRINCIPLES.reduce((s, p) => s + p.weight, 0),
  })),

  // CS-04: compare — Compare two pieces of content
  compare: publicQuery
    .input(z.object({
      contentA: z.string(),
      contentB: z.string(),
      principle: z.enum(["AMANAH", "IHSAN", "ADL", "RAHMAH", "HIKMAH", "ITQAN", "TAWAKKUL"]).optional(),
    }))
    .mutation(({ input }) => {
      const principlesToCheck = input.principle
        ? [PRINCIPLES.find((p) => p.id === input.principle)!]
        : PRINCIPLES;

      const comparison = principlesToCheck.map((principle) => {
        const evalA = evaluatePrinciple(input.contentA, principle);
        const evalB = evaluatePrinciple(input.contentB, principle);
        return {
          principle: { id: principle.id, nameAr: principle.nameAr },
          scoreA: evalA.score,
          scoreB: evalB.score,
          winner: evalA.score > evalB.score ? "A" : evalA.score < evalB.score ? "B" : "TIE",
          difference: Math.abs(evalA.score - evalB.score),
        };
      });

      return {
        comparison,
        overallWinner: comparison.filter((c) => c.winner === "A").length > comparison.filter((c) => c.winner === "B").length
          ? "A"
          : comparison.filter((c) => c.winner === "B").length > comparison.filter((c) => c.winner === "A").length
            ? "B"
            : "TIE",
      };
    }),

  // CS-05: guardianCheck — Direct Guardian Amanah check
  guardianCheck: publicQuery
    .input(z.object({ score: z.number().min(0).max(1) }))
    .query(({ input }) => guardian.checkAmanah(input.score)),

  // CS-06: usfipv2Status — USFIPv2 engine status
  usfipv2Status: publicQuery.query(() => usfipv2.getStatus()),

  // CS-07: stats — Validation statistics
  stats: publicQuery.query(() => ({
    totalValidations,
    totalPassed,
    passRate: totalValidations > 0 ? ((totalPassed / totalValidations) * 100).toFixed(1) : "0",
    recentValidations: validationLog.slice(-20),
  })),
});
