// ============================================================
// METHODS LIBRARY — governed methodology registry (B2-β)
//
// A DATA registry (not free prompts): each approved method is a record
// with an id + declarative, PROGRAMMATICALLY-CHECKABLE rules. A method is
// attached to a task/worker via requireMethod(), and a worker's ACTUAL
// outputs are checked against the declared method via
// verifyMethodCompliance().
//
// Pure module: no I/O, no DB, no keys, no clock reads. Every function is
// total and deterministic so the whole subsystem runs in CI with zero
// external dependencies.
//
// Charter alignment:
//   #1 nothing is "done" without code + test + literal proof — these rules
//      make that machine-checkable (tdd-mandatory / root-cause / standard-git).
//   #2 honest naming: deterministic rule evaluators, never mind-claims.
//   #5 build on what exists: verifyMethodCompliance REUSES B1's Codex Guard
//      (scanFiles / scanText) to catch charter deviations in worker files —
//      it does not re-implement deviation scanning.
//
// Fail-closed: an unknown method or a missing input is REJECTED (never
// silently accepted).
// ============================================================
import { scanFiles, type ScanFileInput } from "./codex-guard";

// --- Method identity ------------------------------------------------------

/** The five approved, governed methods (closed set). */
export const METHOD_IDS = [
  "tdd-mandatory",
  "subagent-driven",
  "root-cause-tracing",
  "adr",
  "standard-git",
] as const;
export type MethodId = (typeof METHOD_IDS)[number];

/** Every declarative rule kind a method can carry (machine-evaluable). */
export type MethodRuleKind =
  | "test-before-code"
  | "test-file-per-code"
  | "exclusive-file-ownership"
  | "root-cause-before-fix"
  | "adr-required"
  | "pr-size-limit"
  | "commit-coauthor"
  | "no-self-merge"
  | "no-charter-deviations";

export interface MethodRule {
  kind: MethodRuleKind;
  /** Human description of what the rule requires. */
  description: string;
  /** Declarative, checkable parameters (e.g. a PR size cap). */
  params?: Record<string, number | string | boolean>;
}

export interface Method {
  id: MethodId;
  title: string;
  description: string;
  rules: MethodRule[];
}

// --- Worker outputs (the evidence a method is checked against) ------------

export type EvidenceType =
  | "TEST"
  | "CODE"
  | "RUN"
  | "ROOT_CAUSE"
  | "FIX"
  | "ADR"
  | "DECISION"
  | "COMMIT"
  | "MERGE";

export interface WorkerEvidence {
  type: EvidenceType;
  /** File path / id the evidence refers to. */
  ref?: string;
  /** ISO timestamp — used to order test-before-code, root-cause-before-fix. */
  date?: string;
  // ADR fields (required when type === "ADR"):
  context?: string;
  decision?: string;
  consequences?: string;
}

export interface WorkerFile {
  path: string;
  /** Optional explicit kind; otherwise inferred from the path. */
  kind?: "code" | "test" | "doc";
  /** File contents — required for the Codex Guard (B1) charter re-scan. */
  content?: string;
}

/** A subagent scope with the exclusive set of files it owns. */
export interface WorkerScope {
  id: string;
  files: string[];
}

export interface WorkerOutput {
  files?: WorkerFile[];
  evidence?: WorkerEvidence[];
  scopes?: WorkerScope[];
  pr?: { changedLines?: number; selfMerged?: boolean };
  commitMessages?: string[];
}

// --- Violations / reports -------------------------------------------------

export type ViolationRule = MethodRuleKind | "unknown-method" | "missing-input";

export interface MethodViolation {
  rule: ViolationRule;
  message: string;
}

export interface ComplianceReport {
  methodId?: MethodId;
  compliant: boolean;
  violations: MethodViolation[];
}

export interface MethodRequirement {
  methodId: MethodId;
  /** Optional task/worker the method is attached to. */
  target?: string;
  rules: MethodRule[];
}

export type MethodErrorCode = "UNKNOWN_METHOD";

export class MethodError extends Error {
  readonly code: MethodErrorCode;
  constructor(code: MethodErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "MethodError";
  }
}

const DEFAULT_PR_SIZE_LIMIT = 400;

// --- The registry (data records) -----------------------------------------

const REGISTRY: Record<MethodId, Method> = {
  "tdd-mandatory": {
    id: "tdd-mandatory",
    title: "TDD إلزامي — الاختبار قبل الكود",
    description:
      "لكل ملف كود يجب وجود ملف اختبار مقابل، ودليل TEST مؤرّخ قبل/مع دليل CODE.",
    rules: [
      {
        kind: "test-before-code",
        description:
          "يجب وجود دليل TEST مؤرّخ في وقت لا يلي أقدم دليل CODE (لا اختبار بعد الكود).",
      },
      {
        kind: "test-file-per-code",
        description: "لكل ملف كود ملف اختبار مقابل باسم مطابق.",
      },
    ],
  },
  "subagent-driven": {
    id: "subagent-driven",
    title: "تفكيك بعقود ملكية ملفات",
    description:
      "لكل نطاق فرعي مجموعة ملفات حصرية لا تتقاطع مع نطاق آخر (يُكشف تقاطع الملكية).",
    rules: [
      {
        kind: "exclusive-file-ownership",
        description: "لا يجوز أن يملك نطاقان الملف نفسه — تقاطع الملكية مرفوض.",
      },
    ],
  },
  "root-cause-tracing": {
    id: "root-cause-tracing",
    title: "تشخيص جذري قبل الإصلاح",
    description: "أي إصلاح (FIX) يسبقه سجل سبب‑جذري (ROOT_CAUSE) موثّق ومؤرّخ.",
    rules: [
      {
        kind: "root-cause-before-fix",
        description:
          "يجب وجود دليل ROOT_CAUSE مؤرّخ قبل/مع أقدم دليل FIX — إصلاح بلا سبب‑جذري مرفوض.",
      },
    ],
  },
  adr: {
    id: "adr",
    title: "قرار معماري موثّق (ADR)",
    description:
      "أي قرار معماري يرافقه سجل ADR بالحقول الثلاثة: context / decision / consequences.",
    rules: [
      {
        kind: "adr-required",
        description:
          "لكل قرار معماري سجل ADR مكتمل الحقول (context, decision, consequences غير فارغة).",
      },
    ],
  },
  "standard-git": {
    id: "standard-git",
    title: "Git منضبط — worktrees + rebase + PRs صغيرة",
    description:
      "حجم PR ≤ الحد، كل رسالة commit تحوي Co-authored-by، لا دمج ذاتي، ولا انحرافات ميثاق في الملفات.",
    rules: [
      {
        kind: "pr-size-limit",
        description: "عدد الأسطر المتغيّرة في الـPR لا يتجاوز الحد المسموح.",
        params: { maxChangedLines: DEFAULT_PR_SIZE_LIMIT },
      },
      {
        kind: "commit-coauthor",
        description: "كل رسالة commit تتضمن سطر Co-authored-by.",
      },
      {
        kind: "no-self-merge",
        description: "ممنوع الدمج الذاتي — الدمج يتم بتحقق مستقل.",
      },
      {
        kind: "no-charter-deviations",
        description:
          "ملفات العامل خالية من انحرافات الميثاق (يعيد استخدام حارس B1).",
      },
    ],
  },
};

// --- Registry access ------------------------------------------------------

export function listMethods(): Method[] {
  return METHOD_IDS.map((id) => REGISTRY[id]);
}

export function getMethod(id: string): Method | undefined {
  return (METHOD_IDS as readonly string[]).includes(id)
    ? REGISTRY[id as MethodId]
    : undefined;
}

/**
 * Attach a method to a task/worker and yield the concrete rules to satisfy.
 * FAIL-CLOSED: an unknown method throws MethodError rather than returning
 * an empty (silently-passing) requirement.
 */
export function requireMethod(id: string, target?: string): MethodRequirement {
  const method = getMethod(id);
  if (!method) {
    throw new MethodError(
      "UNKNOWN_METHOD",
      `منهج غير معروف: «${id}». المناهج المعتمدة: ${METHOD_IDS.join(", ")}.`,
    );
  }
  return { methodId: method.id, target, rules: method.rules };
}

// --- Helpers (pure) -------------------------------------------------------

function isTestFile(file: WorkerFile): boolean {
  if (file.kind === "test") return true;
  if (file.kind === "code" || file.kind === "doc") return false;
  return /(\.test\.|\.spec\.|__tests__[/\\])/i.test(file.path);
}

function isCodeFile(file: WorkerFile): boolean {
  if (file.kind === "code") return true;
  if (file.kind) return false; // explicit test/doc
  return /\.(ts|tsx|js|jsx)$/i.test(file.path) && !isTestFile(file);
}

function baseName(path: string): string {
  const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return name
    .replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/i, "")
    .replace(/\.(ts|tsx|js|jsx)$/i, "");
}

function earliest(dates: Array<string | undefined>): number | undefined {
  const stamps = dates
    .map((d) => (d ? Date.parse(d) : Number.NaN))
    .filter((n) => !Number.isNaN(n));
  return stamps.length ? Math.min(...stamps) : undefined;
}

function evidenceOf(output: WorkerOutput, type: EvidenceType): WorkerEvidence[] {
  return (output.evidence ?? []).filter((e) => e.type === type);
}

// --- Rule evaluators ------------------------------------------------------

type RuleEvaluator = (
  rule: MethodRule,
  output: WorkerOutput,
) => MethodViolation[];

const EVALUATORS: Record<MethodRuleKind, RuleEvaluator> = {
  "test-before-code": (_rule, output) => {
    const code = evidenceOf(output, "CODE");
    if (code.length === 0) return [];
    const tests = evidenceOf(output, "TEST");
    if (tests.length === 0) {
      return [
        {
          rule: "test-before-code",
          message: "دليل CODE موجود بلا أي دليل TEST — الاختبار قبل الكود مفقود.",
        },
      ];
    }
    const earliestTest = earliest(tests.map((t) => t.date));
    const earliestCode = earliest(code.map((c) => c.date));
    if (
      earliestTest !== undefined &&
      earliestCode !== undefined &&
      earliestTest > earliestCode
    ) {
      return [
        {
          rule: "test-before-code",
          message: "أقدم دليل TEST يلي أقدم دليل CODE — هذا اختبار بعد الكود.",
        },
      ];
    }
    return [];
  },

  "test-file-per-code": (_rule, output) => {
    const files = output.files ?? [];
    const codeFiles = files.filter(isCodeFile);
    const testBases = new Set(
      files.filter(isTestFile).map((f) => baseName(f.path)),
    );
    const violations: MethodViolation[] = [];
    for (const code of codeFiles) {
      if (!testBases.has(baseName(code.path))) {
        violations.push({
          rule: "test-file-per-code",
          message: `ملف الكود «${code.path}» بلا ملف اختبار مقابل.`,
        });
      }
    }
    return violations;
  },

  "exclusive-file-ownership": (_rule, output) => {
    const scopes = output.scopes ?? [];
    const owners = new Map<string, string[]>();
    for (const scope of scopes) {
      for (const file of scope.files) {
        const list = owners.get(file) ?? [];
        list.push(scope.id);
        owners.set(file, list);
      }
    }
    const violations: MethodViolation[] = [];
    for (const [file, scopeIds] of owners) {
      if (scopeIds.length > 1) {
        violations.push({
          rule: "exclusive-file-ownership",
          message: `الملف «${file}» مملوك لأكثر من نطاق (${scopeIds.join(", ")}) — تقاطع ملكية.`,
        });
      }
    }
    return violations;
  },

  "root-cause-before-fix": (_rule, output) => {
    const fixes = evidenceOf(output, "FIX");
    if (fixes.length === 0) return [];
    const roots = evidenceOf(output, "ROOT_CAUSE");
    if (roots.length === 0) {
      return [
        {
          rule: "root-cause-before-fix",
          message: "دليل FIX بلا سجل ROOT_CAUSE موثّق — إصلاح بلا تشخيص جذري.",
        },
      ];
    }
    const earliestRoot = earliest(roots.map((r) => r.date));
    const earliestFix = earliest(fixes.map((f) => f.date));
    if (
      earliestRoot !== undefined &&
      earliestFix !== undefined &&
      earliestRoot > earliestFix
    ) {
      return [
        {
          rule: "root-cause-before-fix",
          message: "سجل ROOT_CAUSE مؤرّخ بعد أقدم FIX — التشخيص لم يسبق الإصلاح.",
        },
      ];
    }
    return [];
  },

  "adr-required": (_rule, output) => {
    const decisions = evidenceOf(output, "DECISION");
    const adrs = evidenceOf(output, "ADR");
    const violations: MethodViolation[] = [];
    if (decisions.length > 0 && adrs.length === 0) {
      violations.push({
        rule: "adr-required",
        message: "قرار معماري (DECISION) بلا سجل ADR مرافق.",
      });
    }
    for (const adr of adrs) {
      const missing: string[] = [];
      if (!adr.context?.trim()) missing.push("context");
      if (!adr.decision?.trim()) missing.push("decision");
      if (!adr.consequences?.trim()) missing.push("consequences");
      if (missing.length > 0) {
        violations.push({
          rule: "adr-required",
          message: `سجل ADR «${adr.ref ?? "?"}» ناقص الحقول: ${missing.join(", ")}.`,
        });
      }
    }
    return violations;
  },

  "pr-size-limit": (rule, output) => {
    const limit =
      typeof rule.params?.maxChangedLines === "number"
        ? rule.params.maxChangedLines
        : DEFAULT_PR_SIZE_LIMIT;
    const changed = output.pr?.changedLines;
    if (typeof changed === "number" && changed > limit) {
      return [
        {
          rule: "pr-size-limit",
          message: `حجم PR (${changed} سطر) يتجاوز الحد (${limit}).`,
        },
      ];
    }
    return [];
  },

  "commit-coauthor": (_rule, output) => {
    const messages = output.commitMessages ?? [];
    const violations: MethodViolation[] = [];
    for (const msg of messages) {
      if (!/co-authored-by/i.test(msg)) {
        violations.push({
          rule: "commit-coauthor",
          message: `رسالة commit بلا سطر Co-authored-by: «${msg.split("\n")[0].slice(0, 60)}».`,
        });
      }
    }
    return violations;
  },

  "no-self-merge": (_rule, output) => {
    if (output.pr?.selfMerged === true) {
      return [
        {
          rule: "no-self-merge",
          message: "دمج ذاتي مرصود — الدمج يجب أن يتم بتحقق مستقل.",
        },
      ];
    }
    return [];
  },

  "no-charter-deviations": (_rule, output) => {
    const scannable: ScanFileInput[] = (output.files ?? [])
      .filter((f) => typeof f.content === "string")
      .map((f) => ({ filename: f.path, content: f.content as string }));
    if (scannable.length === 0) return [];
    const report = scanFiles(scannable);
    return report.findings.map((finding) => ({
      rule: "no-charter-deviations" as const,
      message: `انحراف ميثاق في «${finding.filename}»:${finding.line} [${finding.rule}] ${finding.message}`,
    }));
  },
};

// --- The public verification entry point ----------------------------------

/**
 * Check a worker's ACTUAL outputs against the declared method. Returns
 * {compliant, violations}. FAIL-CLOSED: an unknown method or a missing
 * input yields a rejection, never a silent pass. Reuses Codex Guard (B1)
 * for the charter-deviation rule.
 */
export function verifyMethodCompliance(
  method: MethodId | string | Method,
  output: WorkerOutput,
): ComplianceReport {
  const resolved =
    typeof method === "string" ? getMethod(method) : method;

  if (!resolved) {
    return {
      compliant: false,
      violations: [
        {
          rule: "unknown-method",
          message: `منهج غير معروف: «${String(method)}» — رفض آمن (fail-closed).`,
        },
      ],
    };
  }

  if (output === null || output === undefined) {
    return {
      methodId: resolved.id,
      compliant: false,
      violations: [
        {
          rule: "missing-input",
          message: "مدخل مخرجات العامل ناقص — رفض آمن (fail-closed).",
        },
      ],
    };
  }

  const violations: MethodViolation[] = [];
  for (const rule of resolved.rules) {
    violations.push(...EVALUATORS[rule.kind](rule, output));
  }

  return {
    methodId: resolved.id,
    compliant: violations.length === 0,
    violations,
  };
}
