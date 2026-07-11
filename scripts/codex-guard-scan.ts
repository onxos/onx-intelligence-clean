// ============================================================
// CODEX GUARD SCAN — CI entry point (B1)
//
// Scans staged/changed source files for charter deviations and exits
// non-zero when any ERROR-severity deviation is found. Designed to run
// as a mandatory CI step.
//
// Usage:
//   tsx scripts/codex-guard-scan.ts [file ...]      # scan given files
//   tsx scripts/codex-guard-scan.ts --changed        # scan git-changed files
//   tsx scripts/codex-guard-scan.ts                  # scan api/ + src/ (default)
// ============================================================
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, extname } from "node:path";
import { scanFiles, type ScanFileInput } from "../api/lib/codex-guard";

const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);
const DEFAULT_ROOTS = ["api", "src"];
const IGNORE = new Set(["node_modules", "dist", ".git", "__tests__"]);

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

function main(): void {
  const targets = resolveTargets(process.argv);
  const files: ScanFileInput[] = [];
  for (const f of targets) {
    try {
      files.push({ filename: f, content: readFileSync(f, "utf8") });
    } catch {
      // unreadable file — skip
    }
  }

  const report = scanFiles(files);
  const errors = report.findings.filter((d) => d.severity === "error");

  process.stdout.write(
    `[codex-guard] scanned ${report.scannedFiles} files — ` +
      `${report.totalDeviations} deviation(s) ` +
      `(FORBIDDEN_LABEL=${report.byRule.FORBIDDEN_LABEL}, ` +
      `FAIL_OPEN=${report.byRule.FAIL_OPEN}, ` +
      `FAKE_LIVE_METRIC=${report.byRule.FAKE_LIVE_METRIC})\n`,
  );

  for (const f of report.findings) {
    process.stdout.write(
      `  ${f.severity === "error" ? "✖" : "⚠"} ${f.filename}:${f.line} [${f.rule}] ${f.message}\n`,
    );
  }

  if (errors.length > 0) {
    process.stderr.write(
      `\n[codex-guard] FAILED — ${errors.length} charter violation(s).\n`,
    );
    process.exit(1);
  }
  process.stdout.write("[codex-guard] OK — no charter violations.\n");
}

main();
