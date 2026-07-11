// ============================================================
// CODEX GUARD — charter enforcement, technically (B1)
//
// Two deterministic capabilities:
//   (a) scanText(): detects charter DEVIATION patterns in source code
//   (b) evaluateClaim(): scores any maturity claim against the OCMBR
//       truth ledger — a claim is only CONFIRMED if the evidence-derived
//       state is at least as mature as the claimed state.
//
// Pure, no I/O / keys, so it runs in CI. The CLI (scripts/codex-guard-scan.ts)
// feeds file contents in; this module owns the rules.
// ============================================================
import {
  maturityRank,
  type MaturityState,
} from "./ocmbr-engine";

export type DeviationRule =
  | "FORBIDDEN_LABEL" // consciousness / self-aware / sentient claims in production code
  | "FAIL_OPEN" // a safety guard that returns "allowed/passed: true" from a catch
  | "FAKE_LIVE_METRIC"; // Math.random()/hardcoded value fed into a *live/score/metric* field

export interface Deviation {
  rule: DeviationRule;
  line: number;
  match: string;
  message: string;
  severity: "error" | "warning";
}

// Opt-out marker: put `// codex-guard:allow <reason>` on the offending
// line or the line directly above it to consciously suppress a finding.
const ALLOW_MARKER = /codex-guard:allow/i;

// (a) Forbidden anthropomorphic claim labels in production code.
// Word-boundary matched, case-insensitive. Tests/docs are excluded by
// the caller (scanText receives an `isProduction` flag).
const FORBIDDEN_LABELS = [
  "consciousness",
  "self-aware",
  "selfaware",
  "sentient",
  "sentience",
  "conscious mind",
];

// (c) Fields whose value must be LIVE — fabricating them is a deviation.
const LIVE_FIELD = /(score|rate|index|metric|confidence|accuracy|health|live)\s*[:=]/i;

function isAllowed(lines: string[], idx: number): boolean {
  if (ALLOW_MARKER.test(lines[idx])) return true;
  if (idx > 0 && ALLOW_MARKER.test(lines[idx - 1])) return true;
  return false;
}

export interface ScanOptions {
  filename?: string;
  /** Production code is held to the full charter; tests/docs are exempt from label rules. */
  isProduction?: boolean;
}

export function scanText(source: string, options: ScanOptions = {}): Deviation[] {
  const { isProduction = true } = options;
  const lines = source.split(/\r?\n/);
  const out: Deviation[] = [];

  // Track catch blocks by the brace depth their body sits at, so we can
  // spot fail-open guards (a truthy "pass" returned from inside a catch).
  const catchStack: number[] = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    const lineNo = i + 1;

    // (0) Drop catch frames whose block has already closed.
    while (catchStack.length > 0 && braceDepth < catchStack[catchStack.length - 1]) {
      catchStack.pop();
    }
    const insideCatch = catchStack.length > 0;

    // --- Rule A: forbidden labels (production code only) ---
    if (isProduction && !isAllowed(lines, i)) {
      for (const label of FORBIDDEN_LABELS) {
        const re = new RegExp(`\\b${label.replace(/[-\s]/g, "[-\\s]?")}\\b`, "i");
        if (re.test(lower)) {
          out.push({
            rule: "FORBIDDEN_LABEL",
            line: lineNo,
            match: label,
            severity: "error",
            message: `تسمية محظورة في كود الإنتاج: «${label}». استخدم توصيفاً صادقاً (runtime loop لا consciousness).`,
          });
        }
      }
    }

    // --- Rule C: fake live metric ---
    if (!isAllowed(lines, i)) {
      const fabricates = /Math\.random\s*\(/.test(line);
      if (fabricates && LIVE_FIELD.test(line)) {
        out.push({
          rule: "FAKE_LIVE_METRIC",
          line: lineNo,
          match: line.trim().slice(0, 80),
          severity: "error",
          message:
            "قيمة عشوائية/ثابتة تُقدَّم كمؤشر حيّ (score/rate/metric...). المؤشرات الحية تُحسب من بيانات فعلية.",
        });
      }
    }

    // --- Rule B: fail-open safety guard (truthy pass from inside a catch) ---
    if (insideCatch && !isAllowed(lines, i)) {
      if (/return\s+(true\b|\{[^}]*\b(passed|allowed|trusted|ok|valid|safe)\s*:\s*true)/i.test(line)) {
        out.push({
          rule: "FAIL_OPEN",
          line: lineNo,
          match: line.trim().slice(0, 80),
          severity: "error",
          message:
            "حارس سلامة fail-open: يُعيد قبولاً/نجاحاً من داخل catch. حراس السلامة يجب أن تكون fail-closed.",
        });
      }
    }

    // (Z) Update brace depth, then open a catch frame if this line starts one.
    const hasCatch = /\bcatch\b\s*(\([^)]*\))?\s*\{/.test(line);
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    braceDepth += opens - closes;
    if (hasCatch) catchStack.push(braceDepth);
  }

  return out;
}

export interface ScanFileInput {
  filename: string;
  content: string;
}

export interface ScanReport {
  scannedFiles: number;
  totalDeviations: number;
  byRule: Record<DeviationRule, number>;
  findings: Array<Deviation & { filename: string }>;
  clean: boolean;
}

/** Production files: real source, excluding tests, docs and this guard itself. */
export function isProductionFile(filename: string): boolean {
  const f = filename.replace(/\\/g, "/");
  if (/\.(md|test\.ts|test\.tsx|spec\.ts)$/i.test(f)) return false;
  if (/__tests__\//.test(f)) return false;
  if (/codex-guard/.test(f)) return false; // the guard names the labels on purpose
  return /\.(ts|tsx|js|jsx)$/i.test(f);
}

export function scanFiles(files: ScanFileInput[]): ScanReport {
  const findings: Array<Deviation & { filename: string }> = [];
  const byRule: Record<DeviationRule, number> = {
    FORBIDDEN_LABEL: 0,
    FAIL_OPEN: 0,
    FAKE_LIVE_METRIC: 0,
  };
  let scanned = 0;
  for (const file of files) {
    if (!/\.(ts|tsx|js|jsx|md)$/i.test(file.filename)) continue;
    scanned += 1;
    const devs = scanText(file.content, {
      filename: file.filename,
      isProduction: isProductionFile(file.filename),
    });
    for (const d of devs) {
      findings.push({ ...d, filename: file.filename });
      byRule[d.rule] += 1;
    }
  }
  return {
    scannedFiles: scanned,
    totalDeviations: findings.length,
    byRule,
    findings,
    clean: findings.length === 0,
  };
}

// --- (b) Claim evaluation against the OCMBR ledger -----------------------

export type ClaimVerdict = "CONFIRMED" | "OVERSTATED" | "UNKNOWN";

export interface ClaimEvaluation {
  verdict: ClaimVerdict;
  claimedState: MaturityState;
  actualState: MaturityState | null;
  message: string;
}

/**
 * A claim is CONFIRMED only when the evidence-derived state is at least
 * as mature as the claimed state. If the ledger has no such capability →
 * UNKNOWN. If reality is below the claim → OVERSTATED (charter violation).
 */
export function evaluateClaim(
  claimedState: MaturityState,
  actualState: MaturityState | null,
): ClaimEvaluation {
  if (actualState === null) {
    return {
      verdict: "UNKNOWN",
      claimedState,
      actualState: null,
      message: "لا توجد قدرة مطابقة في سجل OCMBR — الادعاء غير قابل للتحقق.",
    };
  }
  if (maturityRank(actualState) >= maturityRank(claimedState)) {
    return {
      verdict: "CONFIRMED",
      claimedState,
      actualState,
      message: `مؤكد: الحالة الفعلية (${actualState}) ≥ المُدّعاة (${claimedState}).`,
    };
  }
  return {
    verdict: "OVERSTATED",
    claimedState,
    actualState,
    message: `ادعاء مبالغ: المُدّعى (${claimedState}) أعلى من الفعلي المحسوب من الأدلة (${actualState}).`,
  };
}
