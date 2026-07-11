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
        "محرك تنسيق: تفويضات بخريطة موجات مغلقة، توزيع عبر executor قابل للتبديل، تحقق مستقل يرفض الشهادة الذاتية، حاكم ميزانية، استئناف متعثر.",
    },
    units: [
      { kind: "code", path: "api/lib/orchestrator-engine.ts" },
      { kind: "code", path: "api/lib/orchestrator-store.ts" },
      { kind: "code", path: "api/orchestrator-router.ts" },
      { kind: "test", path: "api/__tests__/orchestrator.test.ts" },
    ],
    criteria: [
      { id: "ac-b2-core-loop", statement: "دورة كاملة: تفويض → خريطة موجات مغلقة (كل موجة ببوابة خروج) → توزيع عبر executor قابل للتبديل → تقرير", verifyCommand: "vitest run orchestrator" },
      { id: "ac-b2-independent-verify", statement: "تحقق مستقل يرفض شهادة المنفذ الذاتية: يعيد فحص المخرجات ويسم الكذب OVERSTATED عبر B1", verifyCommand: "vitest run orchestrator" },
      { id: "ac-b2-budget", statement: "حاكم ميزانية يوقف الموجة عند تجاوز السقف", verifyCommand: "vitest run orchestrator" },
      { id: "ac-b2-straggler", statement: "كشف المهام المتعثرة وإعادة توزيعها بسياسة", verifyCommand: "vitest run orchestrator" },
      { id: "ac-b2-merged", statement: "CI أخضر + دمج squash في main (يُسجَّل دليل الدمج بعد حدوثه)", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-b2-core-loop", command: "ls api/lib/orchestrator-engine.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b2-core-loop", command: "vitest run orchestrator", output: "FULL CYCLE: mandate → closed waves → execute → verify → report — proven؛ رفض الموجة المفتوحة", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b2-independent-verify", command: "vitest run orchestrator", output: "REJECTS a FALSE self-certification and flags it OVERSTATED (B1) + re-scan + recompute hash", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b2-budget", command: "vitest run orchestrator", output: "HALTS the mandate when the budget cap is breached", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b2-straggler", command: "vitest run orchestrator", output: "detects + RESUMES a straggler (reassigned then verified)", verifier: VERIFIER },
      { kind: "RUN", command: "vitest run", output: "41 ملف / 577 اختبار أخضر (CI)", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b2-merged", command: "gh pr merge 35 --squash", commit: "4bd6de1e21aa6661326829ef7c3fd46f4c75368c", output: "PR #35 squash-merged to main; codex-guard + Deploy + Verify Staging Health all green", date: "2026-07-11", verifier: "independent: coordinator re-ran full gate (tsc/eslint/guard 0-new/vitest 41×577) + read independentlyVerify source (reuses B1 scanText/evaluateClaim + B0 maturity)" },
    ],
  },
  {
    capability: {
      code: "B2-METHODS-LIBRARY",
      title: "Methods Library — governed methodology registry (B2-β)",
      program: "B2",
      owner: "coordinator",
      description:
        "سجل مناهج تشغيل كبيانات (لا prompts حرة): مناهج بقواعد machine-checkable + requireMethod (فرض) + verifyMethodCompliance (fail-closed) يعيد استخدام حارس B1.",
    },
    units: [
      { kind: "code", path: "api/lib/methods-library.ts" },
      { kind: "code", path: "api/methods-library-router.ts" },
      { kind: "test", path: "api/__tests__/methods-library.test.ts" },
    ],
    criteria: [
      { id: "ac-b2ml-registry", statement: "المناهج المعتمدة سجلات بيانات لكل منهج id + قواعد قابلة للفحص برمجياً (لا prose فقط)", verifyCommand: "vitest run methods-library" },
      { id: "ac-b2ml-verify", statement: "verifyMethodCompliance يفحص مخرجات العامل الفعلية ضد المنهج، fail-closed للمجهول، ويعيد استخدام حارس B1 (scanFiles)", verifyCommand: "vitest run methods-library" },
      { id: "ac-b2ml-merged", statement: "CI أخضر + دمج squash في main (يُسجَّل دليل الدمج بعد حدوثه)", verifyCommand: "gh pr checks" },
      { id: "ac-b2ml-ops-merged", statement: "المناهج التشغيلية الثلاث (git-hygiene, push-early-often, independent-bisect) مدموجة في main واختبارات المكتبة تعمل فعلياً في بوابة CI", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-b2ml-registry", command: "ls api/lib/methods-library.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b2ml-registry", command: "vitest run methods-library", output: "المناهج سجلات بيانات بقواعد machine-checkable", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b2ml-verify", command: "vitest run methods-library", output: "verifyMethodCompliance fail-closed + يعيد استخدام B1 scanFiles — 30 اختبار", verifier: VERIFIER },
      { kind: "RUN", command: "vitest run", output: "42 ملف / 607 اختبار أخضر (CI)", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b2ml-merged", command: "gh pr merge 38 --squash", commit: "4b3ad3b3985a7c330f90a70b9e276a3606167285", output: "PR #38 squash-merged to main; codex-guard + Deploy + Verify Staging Health all green", date: "2026-07-11", verifier: "independent: coordinator rebased single commit onto main + read methods-library source (data records + fail-closed verify reusing B1) + full gate 42×607" },
      { kind: "COMMIT", criterionId: "ac-b2ml-ops-merged", command: "gh pr merge 40 --squash", commit: "c32b68542f237389642eb7bb721e00731dfef5d4", output: "PR #40 squash-merged to main: 3 مناهج تشغيلية (git-hygiene, push-early-often, independent-bisect) → 8 مناهج، 44 اختبار. codex-guard أخضر", date: "2026-07-11", verifier: "independent: coordinator v2 read full diff (fail-closed evaluators) + discovered methods-library tests were NOT in CI, wired them into codex-guard workflow (97e2af8), then confirmed from raw CI logs that all 44 tests actually ran green before merging" },
    ],
  },
  {
    capability: {
      code: "B2-CAPABILITY-FACTORY",
      title: "Capability Factory — governed capability synthesis (B2-γ)",
      program: "B2",
      owner: "coordinator",
      description:
        "مصنع القدرات المحكوم: اقتراح→OCMBR DOCUMENTED→تفويض A2 صريح عبر بوابة B3 (fail-closed)→توليد عبر Executor قابل للتبديل→فحص حارس B1→تحقق مستقل B2→ترقية بأدلة مسجّلة. تكامل لا تكرار.",
    },
    units: [
      { kind: "code", path: "api/lib/capability-factory.ts" },
      { kind: "code", path: "api/capability-factory-router.ts" },
      { kind: "test", path: "api/__tests__/capability-factory.test.ts" },
    ],
    criteria: [
      { id: "ac-b2cf-a2-gate", statement: "لا توليد بلا موافقة مالك صريحة تبلغ A2 — fail-closed، والقرار المسجّل يصدر من بوابة B3 الحقيقية (decideAuthority)", verifyCommand: "vitest run capability-factory" },
      { id: "ac-b2cf-reuse", statement: "الحلقة تعيد استخدام B0 ocmbr-store وB1 scanText وB2 independentlyVerify/mockExecutor — لا إعادة تنفيذ، والترقية بتسجيل أدلة تُحسب لا تُعلن", verifyCommand: "vitest run capability-factory" },
      { id: "ac-b2-gamma-merged", statement: "CI أخضر (اختبارات المصنع تعمل فعلياً في بوابة codex-guard) + دمج squash في main", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-b2cf-a2-gate", command: "ls api/lib/capability-factory.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b2cf-a2-gate", command: "vitest run capability-factory", output: "DENIED بلا موافقة/تحت A2/بهوية فارغة؛ GRANTED فقط بموافقة صريحة تبلغ A2 عبر decideAuthority", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b2cf-reuse", command: "vitest run capability-factory", output: "17 اختباراً: guard يرفض الانحراف، independentlyVerify يسم OVERSTATED لشهادة ذاتية كاذبة، الترقية بأدلة يعيد OCMBR حسابها", verifier: VERIFIER },
      { kind: "RUN", command: "vitest run capability-factory", output: "17 اختباراً أخضر في بوابة CI (سجل خام مؤكد)", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b2-gamma-merged", command: "gh pr merge 42 --squash", commit: "7092aa635720da23f6b0585403b2d0458da5337b", output: "PR #42 squash-merged to main; codex-guard + Deploy + Verify Staging Health all green; worker wired factory tests into CI gate", date: "2026-07-11", verifier: "independent: coordinator v2 read all 751 lines pre-merge (bc6005b..c4e6278), confirmed real reuse of decideAuthority/scanText/independentlyVerify (imports, no re-implementation), fail-closed A2 short-circuit before any execution, then confirmed from raw CI logs 17 tests ran green" },
      // KNOWN CONSTRAINT (evidence-granularity): the factory's promote step
      // records RUN evidence for EVERY criterion from ONE executor output.
      // Acceptable for the deterministic mock; before a REAL executor is
      // wired, promotion MUST record per-criterion evidence from separate
      // verification runs. Recorded as DOC (passed:false) so it can never
      // satisfy a criterion nor alter the computed state.
      { kind: "DOC", output: "قيد معروف evidence-granularity: خطوة الترقية تسجل RUN لكل المعايير من مخرج واحد — يجب فصل الأدلة لكل معيار من تشغيلات تحقق مستقلة قبل ربط منفذ حقيقي.", verifier: "coordinator-v2:constraint", passed: false },
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
      { kind: "code", path: "api/lib/authority-gate.ts" },
      { kind: "code", path: "api/lib/ccmr.ts" },
      { kind: "code", path: "api/lib/cevp-guard.ts" },
      { kind: "code", path: "api/authority-router.ts" },
      { kind: "test", path: "api/__tests__/authority.test.ts" },
    ],
    criteria: [
      { id: "ac-b3-authority", statement: "سلم صلاحيات A0-A5 fail-closed + سجل تدقيق hash-chain يكشف العبث", verifyCommand: "vitest run authority" },
      { id: "ac-b3-ccmr", statement: "CCMR: تصنيف كل أصل/قرار إلى جذر/دستور/مالك/دليل", verifyCommand: "vitest run authority" },
      { id: "ac-b3-cevp", statement: "CEvP: فحص التغيير يرفض الانكماش (fail-closed حفظ القوة)", verifyCommand: "vitest run authority" },
      { id: "ac-b3-merged", statement: "CI أخضر + دمج squash في main (يُسجَّل دليل الدمج بعد حدوثه)", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", criterionId: "ac-b3-authority", command: "ls api/lib/authority-gate.ts", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b3-authority", command: "vitest run authority", output: "fail-closed فوق A2 + كشف عبث hash-chain (brokenAt) — 24 اختبار", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b3-ccmr", command: "vitest run authority", output: "تصنيف CCMR ناجح", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b3-cevp", command: "vitest run authority", output: "CEvP يرفض الانكماش (fail-closed)", verifier: VERIFIER },
      { kind: "RUN", command: "vitest run", output: "40 ملف / 551 اختبار أخضر (CI)", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b3-merged", command: "gh pr merge 34 --squash", commit: "52d4a5bcfdc46cdd65fd1b9a18659d22b14d46a6", output: "PR #34 squash-merged to main; codex-guard + Deploy + Verify Staging Health all green", date: "2026-07-11", verifier: "independent: coordinator re-ran guard scan (0-new) + authority.test.ts (24) + read fail-closed/hash-chain source" },
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
      { kind: "code", path: "api/lib/intelligence-object.ts" },
      { kind: "code", path: "api/lib/persistent-memory.ts" },
      { kind: "code", path: "api/intelligence-object-router.ts" },
      { kind: "test", path: "api/__tests__/intelligence-object.test.ts" },
      { kind: "test", path: "api/__tests__/persistent-memory.test.ts" },
    ],
    criteria: [
      { id: "ac-b4-lifecycle", statement: "دورة حياة كاملة: سؤال→أدلة→حكم→خطة→تعلم + ذاكرة دائمة مع provenance" },
      { id: "ac-b4-memory", statement: "MemoryStore بواجهة واحدة: تطبيق حتمي في-الذاكرة + محول pgvector لا يرمي عند فشل pg، مع provenance إلزامي وتصحيح ونسيان مقصود وتصدير للتدقيق", verifyCommand: "vitest run persistent-memory" },
      { id: "ac-b4-merged", statement: "CI أخضر (اختبارات B4 تعمل فعلياً في بوابة codex-guard) + دمج squash في main", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/os-objects.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run mind-persistence", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
      { kind: "CODE", criterionId: "ac-b4-lifecycle", command: "ls api/lib/intelligence-object.ts", output: "آلة حالات حتمية 11 مرحلة (سؤال→…→تعلم) بانتقالات fail-closed وتاريخ قابل للإعادة", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b4-lifecycle", command: "vitest run intelligence-object", output: "16 اختباراً: دورة كاملة قابلة للإعادة، حكم حتمي من ميزان الأدلة، رفض الانتقالات خارج الترتيب والمدخلات المشوهة، ربط الرؤى القائمة", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b4-memory", command: "vitest run persistent-memory", output: "15 اختباراً: provenance إلزامي fail-closed، تصحيح supersede، نسيان مقصود يظهر في التصدير مع سببه، محول pgvector لا يرمي عند فشل pg ويحافظ على الحتمية", verifier: VERIFIER },
      { kind: "RUN", command: "vitest run intelligence-object persistent-memory", output: "31 اختباراً أخضر في بوابة CI codex-guard (سجل خام مؤكد، run 29149650794)", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b4-merged", command: "gh pr merge 44 --squash", commit: "e44617859f9e7e02a1012b12bb5c9996a2eaec05", output: "PR #44 squash-merged to main; codex-guard + Deploy + Verify Staging Health all green; worker wired B4 suites into CI gate", date: "2026-07-11", verifier: "independent: coordinator v2 read all 1487 lines pre-merge (FSM fail-closed, provenance-mandatory memory, pg adapter never throws + deterministic mirror, new intelligenceObject key = integration not replacement), demanded rebase + CI wiring + honest matrix row before merge, then confirmed from raw CI logs 31 tests ran green" },
      // KNOWN CONSTRAINT: the real pgvector adapter against a live database is
      // NOT exercised in CI — only the deterministic mirror logic is. Recorded
      // as DOC (passed:false) so it can never cover a criterion nor alter state.
      { kind: "DOC", output: "قيد معروف pg-adapter-untested: محول pgvector الحقيقي على قاعدة فعلية غير مُختبَر في CI (المنطق الحتمي فقط) — يلزم اختبار تكامل على Postgres حي قبل الاعتماد الإنتاجي على المرآة.", verifier: "coordinator-v2:constraint", passed: false },
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
      { kind: "code", path: "api/lib/reality-engine.ts" },
      { kind: "code", path: "api/reality-engine-router.ts" },
      { kind: "test", path: "api/__tests__/reality-engine.test.ts" },
    ],
    criteria: [
      { id: "ac-b5-graph", statement: "مسار كامل من الإدخال إلى knowledge graph مع كشف تناقضات وثقة/نطاق صلاحية", verifyCommand: "vitest run reality-engine" },
      { id: "ac-b5-scoped-conflict", statement: "كشف تناقض واعٍ بالنطاق: الحقائق المقيدة زمنياً/مجالياً تتعايش، والحسم عبر تسلسل الحوكمة resolveConflict ثم الثقة ثم UNRESOLVED fail-closed" },
      { id: "ac-b5-merged", statement: "CI أخضر (اختبارات B5 تعمل فعلياً في بوابة codex-guard) + دمج squash في main", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/conflict-engine.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run conflict", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
      { kind: "CODE", criterionId: "ac-b5-graph", command: "ls api/lib/reality-engine.ts", output: "مسار حتمي بلا مفاتيح/DB: ingest fail-closed (provenance إلزامي) → تنظيف/إزالة تكرار → استخراج ثلاثيات (صريحة 1.0 / pipe 0.9 / copula عربي+إنجليزي 0.75) → ontology توسم المسندات المجهولة → knowledge graph حتمي → كشف تناقضات؛ الثقة = موثوقية المصدر × يقين الاستخراج", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b5-graph", command: "vitest run reality-engine", output: "39 اختباراً: ingest fail-closed، استخراج متعدد الأنماط، ontology، graph حتمي عبر التشغيلات، المسار الكامل end-to-end، RealityEngine فوق MemoryStore(B4) مع تصحيح/نسيان مقصود/تصدير وتشابه حتمي deterministicEmbedding", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b5-scoped-conflict", command: "vitest run reality-engine", output: "FUNCTIONAL_CONFLICT وNEGATION يُكشفان فقط عند تداخل النطاقات (عاصمتا ألمانيا المقيدتان زمنياً تتعايشان)، الحسم HIERARCHY عبر resolveConflict الفعلي من conflict-engine ثم CONFIDENCE ثم UNRESOLVED عند التساوي — لا حسم صامت", verifier: VERIFIER },
      { kind: "RUN", command: "vitest run reality-engine", output: "39 اختباراً أخضر في بوابة CI codex-guard (سجل خام مؤكد، run 29151376343 على a35fbbf)", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b5-merged", command: "gh pr merge 49 --squash", commit: "4d46de44d8774781269da9d8e776577ad4da5805", output: "PR #49 squash-merged to main; codex-guard + Deploy + Verify Staging Health all green; worker wired B5 suite into CI gate and rebased over merged B8", date: "2026-07-11", verifier: "independent: coordinator v2 read all 1267 changed lines pre-merge (fail-closed ingest, scope-aware contradiction detection, genuine reuse of conflict-engine resolveConflict + B4 MemoryStore/deterministicEmbedding/intelligence-object — zero reimplementation), ordered removal of invented B5-legacy matrix row before PR, confirmed from raw CI logs 39 tests ran green on final HEAD, then merged" },
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
      { kind: "code", path: "api/lib/zero-input.ts" },
      { kind: "code", path: "api/zero-input-router.ts" },
      { kind: "test", path: "api/__tests__/zero-input.test.ts" },
    ],
    criteria: [
      { id: "ac-b7-suggest", statement: "اقتراحات A0/A1 فقط (لا استقلال فوق A2) + مقاييس ميتا", verifyCommand: "vitest run zero-input" },
      { id: "ac-b7-ceiling", statement: "سقف A1 صارم fail-closed: كل قرار عبر AuthorityGate الفعلي (B3) على سلسلة hash، ما فوق A1 → REQUIRES_APPROVAL، لا مسار تنفيذ في الوحدة (autoExecutable ثابتة false)" },
      { id: "ac-b7-merged", statement: "CI أخضر (اختبارات B7 تعمل فعلياً في بوابة codex-guard) + دمج squash في main", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/living-loop.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run living-loop", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
      { kind: "CODE", criterionId: "ac-b7-suggest", command: "ls api/lib/zero-input.ts", output: "مولد اقتراحات حتمي بلا مفاتيح/DB: محولات فوق الطبقات المدموجة — تناقضات B5 (محسوم→A1، UNRESOLVED→A2)، أحكام B4 (SUPPORTED/REFUTED→A1، INCONCLUSIVE→A0)، أنماط أحداث B8 (دون العتبة→A1، بنيوي→A2) — ثقة = salience × provenance.confidence، ومقاييس ميتا: دقة + معايرة (LOW/MODERATE/HIGH) + drift", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b7-suggest", command: "vitest run zero-input", output: "26 اختباراً: توليد مصنف بالسلطة، fail-closed للمدخل المشوه، محولات التكامل مع B4/B5/B8 تستهلك المخرجات الفعلية (runRealityPipeline/renderJudgment)، مقاييس حتمية (accuracy لا NaN، معايرة، drift، منع تكرار التغذية)", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b7-ceiling", command: "vitest run zero-input", output: "SUGGESTION_CEILING=A1 مثبّت؛ A0/A1→AUTO_ELIGIBLE وA2..A5→REQUIRES_APPROVAL؛ فوق A2 بلا موافقة → DENIED من AuthorityGate؛ كل قرار على سلسلة hash قابلة للتحقق (verifyChain valid)؛ autoExecutable=false دائماً — لا تنفيذ ذاتي", verifier: VERIFIER },
      { kind: "RUN", command: "vitest run zero-input", output: "26 اختباراً أخضر في بوابة CI codex-guard (سجل خام مؤكد، run 29152563934 على 8ce44d3)", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b7-merged", command: "gh pr merge 51 --squash", commit: "99b575df8171d95a4f9d27405663a8378abbcef5", output: "PR #51 squash-merged to main; codex-guard + Deploy + Verify Staging Health all green; worker wired B7 suite into CI gate and rebased over merged B5 ledger", date: "2026-07-11", verifier: "independent: coordinator v2 read all 793 changed lines pre-merge (strict A1 ceiling with no execution path, real AuthorityGate hash-chain per decision, provenance-mandatory persistence via B4 MemoryStore, adapters consume real merged-layer outputs — zero reimplementation), verified rebased tree identical to reviewed tree, confirmed from raw CI logs 26 tests ran green, then merged" },
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
      { kind: "code", path: "api/lib/bridge-contracts.ts" },
      { kind: "code", path: "api/bridge-contracts-router.ts" },
    ],
    criteria: [
      { id: "ac-b8-registry", statement: "schema registry بإصدارات وتحقق كامل لكل الأنواع المؤسسية", verifyCommand: "vitest run bridge-contract" },
      { id: "ac-b8-activity-log", statement: "سجل نشاط موحد بprovenance إلزامي فوق MemoryStore (B4) — الأحداث غير الصالحة لا تُسجَّل والإعادة idempotent" },
      { id: "ac-b8-merged", statement: "CI أخضر (اختبارات B8 تعمل فعلياً في بوابة codex-guard) + دمج squash في main", verifyCommand: "gh pr checks" },
    ],
    evidence: [
      { kind: "CODE", command: "ls api/bridge-guard.ts", verifier: VERIFIER },
      { kind: "TEST", command: "vitest run bridge-contract", output: "passed", verifier: VERIFIER },
      { kind: "RUN", command: "npm test", output: BASELINE_RUN, verifier: VERIFIER },
      { kind: "CODE", criterionId: "ac-b8-registry", command: "ls api/lib/bridge-contracts.ts", output: "سجل مخططات مُصدَّر بنسخ متعايشة (الأحدث افتراضياً)، عقود ثابتة (إعادة تعريف متعارضة → VERSION_CONFLICT)، تحقق fail-closed كامل: نوع مجهول/نسخة مجهولة/حقل مطلوب ناقص/نوع خاطئ → مرفوض", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b8-registry", command: "vitest run bridge-contract", output: "24 اختباراً: تحقق كل الأنواع المؤسسية الـ22، رفض المجهول والمشوه، versioned validation (حقل v2 يُفرض تحت v2 فقط)، سطح tRPC", verifier: VERIFIER },
      { kind: "TEST", criterionId: "ac-b8-activity-log", command: "vitest run bridge-contract", output: "السجل الموحد يعيد استخدام InMemoryMemoryStore(B4): provenance إلزامي fail-closed، الحدث غير الصالح لا يُسجَّل (rejectedCount فقط)، الإعادة idempotent بمعرّف مستقر، تصدير كامل للتدقيق، وربط الإدراك عبر toPerceptionObject النقي", verifier: VERIFIER },
      { kind: "RUN", command: "vitest run bridge-contract", output: "24 اختباراً أخضر في بوابة CI codex-guard (سجل خام مؤكد، run 29150917568)", verifier: VERIFIER },
      { kind: "COMMIT", criterionId: "ac-b8-merged", command: "gh pr merge 47 --squash", commit: "0c4b6a595762dba347af4658ba082510481d9897", output: "PR #47 squash-merged to main; codex-guard + Deploy + Verify Staging Health all green; worker wired B8 suite into CI gate", date: "2026-07-11", verifier: "independent: coordinator v2 read all 843 changed lines pre-merge (fail-closed registry + immutable contracts, genuine reuse of B4 MemoryStore / toPerceptionObject / getBridgeState — zero reimplementation), confirmed from raw CI logs 24 tests ran green, then merged" },
    ],
  },
];
