// ============================================================
// CODEX GUARD SCAN — CI entry point (B1)
//
// Scans source files for charter deviations and exits non-zero when any
// NEW (non-baseline) error-severity deviation is found. Known legacy
// deviations are recorded in docs/codex-guard-baseline.json as tracked
// debt: still reported (never muted), but they don't fail CI — they are
// closed in a dedicated later wave.
//
// Usage:
//   tsx scripts/codex-guard-scan.ts [file ...]         # scan given files
//   tsx scripts/codex-guard-scan.ts --changed           # changed vs HEAD
//   tsx scripts/codex-guard-scan.ts --base=origin/main  # changed vs a base ref
//   tsx scripts/codex-guard-scan.ts                     # scan api/ + src/ (default)
//   tsx scripts/codex-guard-scan.ts --emit-baseline     # (re)generate baseline
// ============================================================
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, extname } from "node:path";
import {
  scanFiles,
  type BaselineEntry,
  type ScanFileInput,
} from "../api/lib/codex-guard";

const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);
const DEFAULT_ROOTS = ["api", "src"];
const IGNORE = new Set(["node_modules", "dist", ".git", "__tests__"]);
const BASELINE_PATH = "docs/codex-guard-baseline.json";

function walk(dir: string, acc: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (SCAN_EXT.has(extname(name))) acc.push(full);
  }
}

function changedFiles(baseRef?: string): string[] {
  const range = baseRef ? `${baseRef}...HEAD` : "HEAD";
  try {
    const out = execSync(`git diff --name-only --diff-filter=ACMR ${range}`, {
      encoding: "utf8",
    });
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && SCAN_EXT.has(extname(s)) && existsSync(s));
  } catch {
    return [];
  }
}

function resolveTargets(argv: string[]): string[] {
  const args = argv.slice(2);
  const baseArg = args.find((a) => a.startsWith("--base="));
  const base = baseArg ? baseArg.split("=")[1] : undefined;
  if (args.includes("--changed") || base) return changedFiles(base);
  const explicit = args.filter((a) => !a.startsWith("--"));
  if (explicit.length > 0) return explicit;
  const acc: string[] = [];
  for (const root of DEFAULT_ROOTS) walk(root, acc);
  return acc;
}

function readFiles(targets: string[]): ScanFileInput[] {
  const files: ScanFileInput[] = [];
  for (const f of targets) {
    try {
      files.push({ filename: f, content: readFileSync(f, "utf8") });
    } catch {
      // unreadable file — skip
    }
  }
  return files;
}

function loadBaseline(): BaselineEntry[] {
  if (!existsSync(BASELINE_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    return Array.isArray(parsed.deviations) ? parsed.deviations : [];
  } catch {
    return [];
  }
}

function emitBaseline(): void {
  const acc: string[] = [];
  for (const root of DEFAULT_ROOTS) walk(root, acc);
  const report = scanFiles(readFiles(acc));
  const deviations: BaselineEntry[] = report.findings.map((f) => ({
    filename: f.filename.replace(/\\/g, "/"),
    rule: f.rule,
    match: f.match,
  }));
  const payload = {
    note:
      "Codex Guard baseline — pre-existing (legacy) charter deviations tracked as debt to be closed in a dedicated later wave. NOT muted: still reported. New deviations are NOT accepted here.",
    generatedAt: new Date().toISOString(),
    total: deviations.length,
    deviations,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  process.stdout.write(
    `[codex-guard] wrote ${deviations.length} baseline entries to ${BASELINE_PATH}\n`,
  );
}

function main(): void {
  if (process.argv.includes("--emit-baseline")) {
    emitBaseline();
    return;
  }

  const targets = resolveTargets(process.argv);
  const files = readFiles(targets);
  const baseline = loadBaseline();
  const report = scanFiles(files, baseline);
  const newErrors = report.findings.filter(
    (d) => !d.known && d.severity === "error",
  );

  process.stdout.write(
    `[codex-guard] scanned ${report.scannedFiles} files — ` +
      `${report.totalDeviations} deviation(s): ` +
      `${report.newDeviations} new, ${report.knownDeviations} known-legacy ` +
      `(FORBIDDEN_LABEL=${report.byRule.FORBIDDEN_LABEL}, ` +
      `FAIL_OPEN=${report.byRule.FAIL_OPEN}, ` +
      `FAKE_LIVE_METRIC=${report.byRule.FAKE_LIVE_METRIC})\n`,
  );

  for (const f of report.findings) {
    const tag = f.known ? "· known-legacy" : "✖ NEW";
    process.stdout.write(
      `  ${tag} ${f.filename}:${f.line} [${f.rule}] ${f.message}\n`,
    );
  }

  if (newErrors.length > 0) {
    process.stderr.write(
      `\n[codex-guard] FAILED — ${newErrors.length} NEW charter violation(s). ` +
        `Fix them (accepted legacy only: run --emit-baseline).\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `[codex-guard] OK — no NEW charter violations` +
      (report.knownDeviations > 0
        ? ` (${report.knownDeviations} known-legacy debt tracked in ${BASELINE_PATH}).\n`
        : ".\n"),
  );
}

main();
