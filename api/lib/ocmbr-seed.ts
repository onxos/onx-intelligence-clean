// ============================================================
// OCMBR SEED — the first honest snapshot of the truth ledger.
//
// Each entry lists ONLY the evidence that genuinely exists in this
// repository today. The maturity state is then COMPUTED (never
// declared). Existing, test-backed subsystems land at PARTIAL/VERIFIED;
// the still-to-build programs (B2..B8) land at DOCUMENTED/MISSING —
// exactly as the charter demands (no self-certification).
// ============================================================
import type {
  CapabilityInput,
  EvidenceKind,
} from "./ocmbr-engine";

interface SeedEvidence {
  kind: EvidenceKind;
  criterionId?: string;
  command?: string;
  output?: string;
  commit?: string;
  date?: string;
  verifier?: string;
  passed?: boolean;
}

interface SeedUnit {
  kind: "code" | "test" | "doc" | "demo" | "runtime";
  path: string;
  description?: string;
}

interface SeedCriterion {
  id: string;
  statement: string;
  verifyCommand?: string;
}

export interface SeedEntry {
  capability: CapabilityInput;
  units?: SeedUnit[];
  criteria?: SeedCriterion[];
  evidence?: SeedEvidence[];
}

const BASELINE_RUN =
  "Test Files 37 passed (37) / Tests 491 passed (491)";
const VERIFIER = "ci:vitest";

export const OCMBR_SEED: SeedEntry[] = [
  // --- Existing, test-backed intelligence subsystems -------------------
  {
    capability: {
      code: "CAP-REFLECTION-CYCLE",
      title: "Reflection Cycle — 7 deterministic insight rules",
      program: "existing",
      owner: "intelligence-runtime",
      description:
        "محرك انعكاس حتمي بـ7 قواعد (دورة/تكرار/تغطية/أحكام/نبض إيراد/شذوذ عدم حضور/فواتير متأخرة).",
    },
    units: [
      { kind: "code", path: "api/lib/reflection-cycle.ts" },
      { kind: "test", path: "api/__tests__/reflection-cycle.test.ts" },
    ],
    criteria: [
      { id: "ac-refl-rules", statement: "القواعد السبع تُنتج رؤى حتمية idempotent" },
      { id: "ac-refl-nothrow", statement: "لا ترمي استثناء عند فشل الرسم/الإدخال" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-refl-rules", command: "ls api/lib/reflection-cycle.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-refl-rules", command: "vitest run reflection-cycle", output: "passed", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-refl-nothrow", command: "vitest run reflection-cycle", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
  {
    capability: {
      code: "CAP-PERCEPTION-ADAPTER",
      title: "Perception Adapter — platform events → live graph",
      program: "existing",
      owner: "intelligence-runtime",
      description: "محوّل إدراك يحوّل أحداث المنصة إلى عُقد PERCEPTION في الرسم الحي.",
    },
    units: [
      { kind: "code", path: "api/lib/perception-adapter.ts" },
      { kind: "test", path: "api/__tests__/perception-adapter.test.ts" },
    ],
    criteria: [
      { id: "ac-perc-map", statement: "تحويل الأحداث إلى عُقد إدراك دون تسريب حقول الحمولة" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-perc-map", command: "ls api/lib/perception-adapter.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-perc-map", command: "vitest run perception-adapter", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
  {
    capability: {
      code: "CAP-IUC-ENGINE",
      title: "IUC Engine — 11-indicator maturity ladder (R1→R6)",
      program: "existing",
      owner: "intelligence-runtime",
      description: "محرك رأس المال الإدراكي: 11 مؤشراً + سلم نضج R1→R6 + بوابات تحقق.",
    },
    units: [
      { kind: "code", path: "api/iuc-engine.ts" },
      { kind: "test", path: "api/__tests__/iuc.test.ts" },
    ],
    criteria: [
      { id: "ac-iuc-ladder", statement: "بوابات الترقية R1→R6 تُطبَّق حتمياً" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-iuc-ladder", command: "ls api/iuc-engine.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-iuc-ladder", command: "vitest run iuc", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
  {
    capability: {
      code: "CAP-USFIP-GUARDIAN",
      title: "USFIP v2 + Guardian — Amanah floor enforcement",
      program: "existing",
      owner: "constitution",
      description: "حارس دستوري يفرض أرضية الأمانة (fail-closed) على الإجراءات المحمية.",
    },
    units: [
      { kind: "code", path: "api/usfip-engine.ts" },
      { kind: "test", path: "api/__tests__/usfip.test.ts" },
    ],
    criteria: [
      { id: "ac-usfip-floor", statement: "يحجب الطلبات عند Amanah < 0.5 (fail-closed)" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-usfip-floor", command: "ls api/usfip-engine.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-usfip-floor", command: "vitest run usfip", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
  {
    capability: {
      code: "CAP-TITAN-BRIDGE",
      title: "Titan Bridge — persona attribution over model gateway",
      program: "existing",
      owner: "titan",
      description: "جسر تيتان: attribution للشخصيات عبر بوابة النماذج (mock-capable).",
    },
    units: [
      { kind: "code", path: "api/titan-bridge-router.ts" },
      { kind: "test", path: "api/__tests__/titan-bridge.test.ts" },
    ],
    criteria: [
      { id: "ac-titan-persona", statement: "كل تيتان يرد بشخصيته مع attribution" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-titan-persona", command: "ls api/titan-bridge-router.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-titan-persona", command: "vitest run titan-bridge", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },

  // --- The civilizational-mind programs (B0..B8) -----------------------
  {
    capability: {
      code: "B0-OCMBR",
      title: "OCMBR Runtime — executive truth ledger",
      program: "B0",
      owner: "coordinator",
      description:
        "سجل الحقيقة: قدرات/وحدات/معايير/أدلة، مع حساب الحالات الخمس من الأدلة.",
    },
    units: [
      { kind: "code", path: "api/lib/ocmbr-engine.ts" },
      { kind: "code", path: "api/lib/ocmbr-store.ts" },
      { kind: "code", path: "api/ocmbr-router.ts" },
      { kind: "test", path: "api/__tests__/ocmbr.test.ts" },
    ],
    criteria: [
      { id: "ac-b0-fivestate", statement: "الحالة تُحسب من الأدلة لا تُعلن يدوياً", verifyCommand: "npm test -- ocmbr" },
      { id: "ac-b0-seed", statement: "استيراد قدرات المشروع كبذرة idempotent", verifyCommand: "npm test -- ocmbr" },
      { id: "ac-b0-merged", statement: "CI أخضر + دمج squash في main (يُسجَّل دليل الدمج بعد حدوثه)", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-b0-fivestate", command: "ls api/lib/ocmbr-engine.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b0-fivestate", command: "vitest run ocmbr", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b0-seed", command: "vitest run ocmbr", verifier: VERIFIER },
      { kind: "RUN", command: "npm test -- ocmbr", output: "see CI", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b0-merged", command: "gh pr merge 32 --squash", commit: "5028c3a3f44c01d275c8835ecb133ad1c5bd9011", output: "PR #32 squash-merged to main; codex-guard + Deploy + Verify Staging Health all green", date: "2026-07-11", verifier: "independent: coordinator via gh pr checks 32" },
    ],
  },
  {
    capability: {
      code: "B1-CODEX-GUARD",
      title: "Codex Guard — charter enforcement in CI",
      program: "B1",
      owner: "coordinator",
      description:
        "فحص أنماط الانحراف (تسميات محظورة/fail-open/قيم مزيفة حية) + تقييم الادعاءات مقابل OCMBR.",
    },
    units: [
      { kind: "code", path: "api/lib/codex-guard.ts" },
      { kind: "code", path: "api/codex-guard-router.ts" },
      { kind: "code", path: "scripts/codex-guard-scan.ts" },
      { kind: "test", path: "api/__tests__/codex-guard.test.ts" },
    ],
    criteria: [
      { id: "ac-b1-scan", statement: "كشف تسميات محظورة وfail-open وقيم مزيفة حية", verifyCommand: "npm test -- codex-guard" },
      { id: "ac-b1-claim", statement: "تقييم ادعاء الحالة مقابل سجل OCMBR", verifyCommand: "npm test -- codex-guard" },
      { id: "ac-b1-merged", statement: "CI أخضر + دمج squash في main (يُسجَّل دليل الدمج بعد حدوثه)", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-b1-scan", command: "ls api/lib/codex-guard.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b1-scan", command: "vitest run codex-guard", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b1-claim", command: "vitest run codex-guard", verifier: VERIFIER },
      { kind: "RUN", command: "npm test -- codex-guard", output: "see CI", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b1-merged", command: "gh pr merge 32 --squash", commit: "5028c3a3f44c01d275c8835ecb133ad1c5bd9011", output: "PR #32 squash-merged to main; codex-guard check green (diff-only + baseline mode)", date: "2026-07-11", verifier: "independent: coordinator via gh pr checks 32" },
    ],
  },
  {
    capability: {
      code: "B2-ORCHESTRATOR",
      title: "ONX Orchestrator — mandate → waves → verify → report",
      program: "B2",
      owner: "coordinator",
      description:
        "محرك تنسيق: تفويضات، توزيع مهام، تحقق مستقل، حاكم ميزانية، استئناف متعثر.",
    },
    units: [{ kind: "doc", path: "docs/ONX_MASTER_EXECUTION_DOCUMENT_v3.0.md" }],
    evidence: [
      { kind: "DOC", command: "founder mandate", output: "specified, not yet implemented", verifier: "coordinator" },
    ],
  },
  {
    capability: {
      code: "B3-CONSTITUTION-RUNTIME",
      title: "Constitution as Runtime — CCMR / CEvP / Authority Gate",
      program: "B3",
      owner: "constitution",
      description: "خدمات fail-closed: تصنيف دستوري، فحص حفظ القوة، سلم صلاحيات A0-A5 بسجل hash-chain.",
    },
    units: [
      { kind: "code", path: "api/cevp-router.ts" },
      { kind: "code", path: "api/constitution-router.ts" },
      { kind: "test", path: "api/__tests__/constitution.test.ts" },
    ],
    criteria: [
      { id: "ac-b3-authority", statement: "سلم صلاحيات A0-A5 بسجل تدقيق hash-chain مكتمل" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/cevp-router.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run constitution", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
  {
    capability: {
      code: "B4-INTELLIGENCE-OBJECTS",
      title: "Intelligence Objects + persistent memory (pgvector)",
      program: "B4",
      owner: "intelligence-runtime",
      description: "كائن ذكاء بدورة حياة كاملة + ذاكرة دائمة PostgreSQL/pgvector مع provenance.",
    },
    units: [
      { kind: "code", path: "api/os-objects.ts" },
      { kind: "test", path: "api/__tests__/mind-persistence.test.ts" },
    ],
    criteria: [
      { id: "ac-b4-lifecycle", statement: "دورة حياة كاملة: سؤال→أدلة→حكم→خطة→تعلم + ذاكرة دائمة مع provenance" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/os-objects.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run mind-persistence", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
  {
    capability: {
      code: "B5-REALITY-ENGINE",
      title: "Reality Engine — ingest → extract → knowledge graph",
      program: "B5",
      owner: "knowledge",
      description: "مسار: ingest→تنظيف→استخراج كيانات/علاقات→ontology→knowledge graph→كشف تناقضات.",
    },
    units: [
      { kind: "code", path: "api/conflict-engine.ts" },
      { kind: "test", path: "api/__tests__/conflict.test.ts" },
    ],
    criteria: [
      { id: "ac-b5-graph", statement: "مسار كامل من الإدخال إلى knowledge graph مع كشف تناقضات وثقة/نطاق صلاحية" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/conflict-engine.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run conflict", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
  {
    capability: {
      code: "B6-EVALUATION-LEARNING",
      title: "Evaluation & Learning — golden sets + regression gates",
      program: "B6",
      owner: "measurement",
      description: "golden sets للقواعد/الاستخراج، قياس دقة/معايرة، regression gates في CI.",
    },
    units: [
      { kind: "code", path: "api/measurement-engine.ts" },
      { kind: "test", path: "api/__tests__/measurement.test.ts" },
    ],
    criteria: [
      { id: "ac-b6-golden", statement: "golden sets + regression gates تمنع التراجع في CI" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/measurement-engine.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run measurement", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
  {
    capability: {
      code: "B7-ZERO-INPUT",
      title: "Constrained Zero-Input + meta-intelligence metrics",
      program: "B7",
      owner: "living-loop",
      description: "مولد اقتراحات A0/A1 من الأحداث/الأنماط + مقاييس جودة العقل (دقة/قبول/drift).",
    },
    units: [
      { kind: "code", path: "api/living-loop.ts" },
      { kind: "test", path: "api/__tests__/living-loop.test.ts" },
    ],
    criteria: [
      { id: "ac-b7-suggest", statement: "اقتراحات A0/A1 فقط (لا استقلال فوق A2) + مقاييس ميتا" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/living-loop.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run living-loop", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
  {
    capability: {
      code: "B8-BRIDGE-CONTRACTS",
      title: "Unified Bridge Contracts — schema registry + activity log",
      program: "B8",
      owner: "bridge",
      description: "schema registry للأحداث بين المنصات (versioning+تحقق) + سجل نشاط موحد + توسيع perception-adapter.",
    },
    units: [
      { kind: "code", path: "api/bridge-guard.ts" },
      { kind: "test", path: "api/__tests__/bridge-contract.test.ts" },
    ],
    criteria: [
      { id: "ac-b8-registry", statement: "schema registry بإصدارات وتحقق كامل لكل الأنواع المؤسسية" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/bridge-guard.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run bridge-contract", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
    ],
  },
];
