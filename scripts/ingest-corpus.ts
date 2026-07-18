// ============================================================
// ingest-corpus — STE-K-16 operator tool for the DEMO→REAL corpus
// upgrade path. Turns the K-10 runbook into executable, committed code.
//
// Zero LLM, zero secrets in the repo (D-19). Two honest modes:
//
//   npm run ingest:corpus -- <docs.json>
//     PREVIEW (default, keyless, deterministic): validate the authentic
//     docs, MEASURE their standalone disclosure (proves they read REAL),
//     and print the exact re-pin step. Nothing is stored.
//
//   npm run ingest:corpus -- <docs.json> --persist
//     PERSIST via the authorized fail-closed bridge endpoint
//     `corpusQuery.ingest`. Requires operator-provided env
//     ONX_HOST + ONX_BRIDGE_KEY (never hardcoded). Batches ≤500.
//
// docs.json = array of { id?, domain, title, body, source }.
//
// HONEST LIVE STATE: the deployed surface stays disclosure:"DEMO" until
// the founder-provided authentic archive (REC-06, 19,012 docs) actually
// replaces the templated seed. This tool does not fabricate that flip —
// it measures it. See docs/OPERATIONS_RUNBOOK.md (Corpus upgrade).
// ============================================================
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateAuthenticDocs,
  toAuthenticSearchDocs,
  buildCorpusContentManifest,
  type AuthenticDocInput,
} from "../api/lib/corpus-upgrade";

const BATCH_MAX = 500;

function fail(msg: string): never {
  console.error(`[ingest:corpus] ERROR: ${msg}`);
  process.exit(1);
}

function loadDocs(path: string): AuthenticDocInput[] {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), path), "utf8");
  } catch {
    fail(`cannot read docs file: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`docs file is not valid JSON: ${path}`);
  }
  if (!Array.isArray(parsed)) fail("docs file must be a JSON array");
  return parsed as AuthenticDocInput[];
}

async function persist(docs: AuthenticDocInput[]): Promise<void> {
  const host = process.env.ONX_HOST;
  const key = process.env.ONX_BRIDGE_KEY;
  if (!host || !key)
    fail("--persist requires ONX_HOST and ONX_BRIDGE_KEY env (operator-provided; never in repo)");

  let accepted = 0;
  let duplicates = 0;
  for (let i = 0; i < docs.length; i += BATCH_MAX) {
    const batch = docs.slice(i, i + BATCH_MAX).map((d) => ({
      domain: d.domain,
      title: d.title,
      body: d.body,
      source: d.source,
    }));
    const res = await fetch(`${host}/api/trpc/corpusQuery.ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-onx-bridge-key": key },
      body: JSON.stringify({ json: { units: batch } }),
    });
    if (res.status === 401 || res.status === 403)
      fail(`bridge rejected the key (fail-closed ${res.status}) — check ONX_BRIDGE_KEY`);
    if (!res.ok) fail(`ingest batch ${i / BATCH_MAX} failed: HTTP ${res.status}`);
    const body = (await res.json()) as { result?: { data?: { json?: { accepted?: number; duplicates?: number } } } };
    const data = body.result?.data?.json ?? {};
    accepted += data.accepted ?? 0;
    duplicates += data.duplicates ?? 0;
  }
  console.log(JSON.stringify({ mode: "persist", host, batches: Math.ceil(docs.length / BATCH_MAX), accepted, duplicates, total: docs.length }, null, 2));
  console.log("\nNext: read corpusQuery.manifest live to confirm the measured disclosure,");
  console.log("then remove the templated seed so templatedDocs reaches 0 for REAL.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const persistMode = args.includes("--persist");
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) fail("usage: ingest:corpus -- <docs.json> [--persist]");

  const docs = loadDocs(path);
  if (docs.length === 0) fail("docs file is empty");

  // 1) Validation gate — structure + real provenance (never the seed marker).
  const issues = validateAuthenticDocs(docs);
  if (issues.length > 0) {
    console.error(`[ingest:corpus] ${issues.length} validation issue(s):`);
    for (const s of issues.slice(0, 20))
      console.error(`  doc#${s.index} (${s.id}): ${s.problem}`);
    process.exit(1);
  }

  // 2) Measured standalone disclosure — proves the authentic set reads REAL.
  const standalone = buildCorpusContentManifest(toAuthenticSearchDocs(docs));

  const report = {
    tool: "ingest:corpus",
    mode: persistMode ? "persist" : "preview",
    docCount: docs.length,
    validation: "PASS",
    measuredStandalone: {
      provenance: standalone.provenance,
      disclosure: standalone.disclosure,
      templatedDocs: standalone.templatedDocs,
      authenticDocs: standalone.authenticDocs,
      domains: standalone.domains.length,
      sha256: standalone.sha256,
    },
    // These docs measure REAL on their own. The LIVE surface flips only
    // when the templated seed is removed (mixed → conservative DEMO).
    honestLiveState:
      "The deployed corpus stays disclosure:DEMO until the templated seed is replaced by the authentic REC-06 archive (19,012 docs). Disclosure flips by MEASUREMENT, never by hand.",
    rePin: [
      "1) Persist authentic docs (this tool with --persist, or the bridge endpoint).",
      "2) Remove the templated seed so templatedDocs === 0 (measurement is the judge).",
      "3) npm run verify:corpus -- --write   # re-pin corpus-manifest.json to the new measured baseline",
      "4) npm run verify:corpus              # must be green (the 6th Truth Gate)",
      "5) Commit corpus-manifest.json in the SAME commit as the corpus replacement.",
    ],
  };
  console.log(JSON.stringify(report, null, 2));

  if (persistMode) {
    console.log("\n--- persisting via authorized bridge ---");
    await persist(docs);
  }
}

void main();
