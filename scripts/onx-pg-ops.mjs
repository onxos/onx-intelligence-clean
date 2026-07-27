#!/usr/bin/env node
/**
 * IU-P0-6 — ONX PostgreSQL backup + isolated restore verification.
 *
 * THIS IS A BACKUP, NOT A DIAGNOSTIC. It runs a real `pg_dump --format=custom`
 * against the target databases, checksums the artifact, and ships it to
 * object storage. It exits non-zero on any failure so a broken backup can
 * never report success.
 *
 * Runs as a Render Cron Job, i.e. INSIDE Render's private network, and reaches
 * each database over its INTERNAL hostname. That is why no IP allowlist entry
 * and no temporary /32 is required, and why nothing about production
 * networking is touched.
 *
 * ---------------------------------------------------------------------------
 * OPERATIONS (env ONX_OP)
 *   backup          (default) pg_dump --format=custom -> sha256 -> object store
 *   restore-verify            pull artifact -> pg_restore into an ISOLATED
 *                             non-production instance -> compare integrity
 *
 * SAFETY INVARIANTS
 *   - Read-only against production: pg_dump plus catalogue SELECTs. No DDL,
 *     no INSERT/UPDATE/DELETE, no migration, no `db push`.
 *   - EXCLUDED_DB_IDS can never be a backup or a restore target.
 *   - restore-verify refuses to write to any host in ONX_PROD_HOST_DENY.
 *   - Retention DELETES NOTHING unless ONX_RETENTION_ENFORCE === "true".
 *     Default is a dry run that only reports what a policy would remove.
 *   - No secret value is ever printed; only key names and masked hosts.
 * ---------------------------------------------------------------------------
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";

// --------------------------------------------------------------------------
// Constants and guards
// --------------------------------------------------------------------------

/** Never dump, never restore into, never touch. Hard denylist. */
const EXCLUDED_DB_IDS = new Set([
  "dpg-d86s3uog4nts73b9j4sg-a", // intelligence — explicitly out of scope
]);

const OP = (process.env.ONX_OP || "backup").trim();
const RUN_ID = process.env.ONX_RUN_ID || `local-${Date.now()}`;
const nowIso = () => new Date().toISOString();
const startedAt = nowIso();
const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); // 20260727T112233Z

const log = (...a) => console.log(`[onx-pg-ops]`, ...a);
const fail = (msg) => {
  console.error(`[onx-pg-ops] FATAL: ${msg}`);
  throw new Error(msg);
};

/** Mask a connection string down to a non-secret shape descriptor. */
function maskConn(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//<user>:<redacted>@${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "<unparseable-connection-string>";
  }
}

// --------------------------------------------------------------------------
// PostgreSQL client-binary selection (major must match the server)
// --------------------------------------------------------------------------

const PG_BIN_ROOTS = ["/usr/lib/postgresql", "/usr/libexec"];

function installedMajors() {
  const found = new Set();
  for (const root of PG_BIN_ROOTS) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const m = /^(?:postgresql)?(\d{2})$/.exec(entry);
      if (m) found.add(Number(m[1]));
    }
  }
  return [...found].sort((a, b) => b - a);
}

function binFor(name, major) {
  const candidates = [
    `/usr/lib/postgresql/${major}/bin/${name}`,
    `/usr/libexec/postgresql${major}/${name}`,
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

/** Newest installed psql — safe for connecting to any older server. */
function anyPsql() {
  for (const major of installedMajors()) {
    const p = binFor("psql", major);
    if (p) return p;
  }
  if (existsSync("/usr/bin/psql")) return "/usr/bin/psql";
  return fail("no psql binary found in the image");
}

function psqlScalar(psql, url, sql) {
  return execFileSync(psql, ["-X", "-A", "-t", "-q", "-c", sql, url], {
    encoding: "utf8",
    timeout: 300_000,
    env: { ...process.env, PGCONNECT_TIMEOUT: "20" },
  }).trim();
}

function psqlRows(psql, url, sql) {
  const out = execFileSync(psql, ["-X", "-A", "-t", "-q", "-F", "\t", "-c", sql, url], {
    encoding: "utf8",
    timeout: 600_000,
    env: { ...process.env, PGCONNECT_TIMEOUT: "20" },
  });
  return out.split("\n").filter(Boolean).map((l) => l.split("\t"));
}

function serverMajor(psql, url) {
  const num = Number(psqlScalar(psql, url, "SHOW server_version_num"));
  if (!Number.isFinite(num)) fail("could not read server_version_num");
  return Math.floor(num / 10000);
}

// --------------------------------------------------------------------------
// Integrity fingerprint — the thing backup and restore compare
// --------------------------------------------------------------------------

const USER_SCHEMA_FILTER =
  "n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%'";

const COUNT_QUERIES = {
  schemas: `SELECT count(*) FROM pg_namespace n WHERE ${USER_SCHEMA_FILTER}`,
  tables: `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND ${USER_SCHEMA_FILTER}`,
  views: `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m') AND ${USER_SCHEMA_FILTER}`,
  sequences: `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND ${USER_SCHEMA_FILTER}`,
  indexes: `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND ${USER_SCHEMA_FILTER}`,
  constraints: `SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE ${USER_SCHEMA_FILTER}`,
  columns: `SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND ${USER_SCHEMA_FILTER}`,
};

/**
 * Exact per-table row counts plus a structural fingerprint.
 * NON-PII BY CONSTRUCTION: only catalogue metadata (schema/table/column names,
 * types) and aggregate counts leave the database. No row values are read.
 */
function fingerprint(psql, url) {
  const counts = {};
  for (const [k, sql] of Object.entries(COUNT_QUERIES)) {
    counts[k] = Number(psqlScalar(psql, url, sql));
  }

  const tables = psqlRows(
    psql,
    url,
    `SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='r' AND ${USER_SCHEMA_FILTER} ORDER BY 1,2`,
  );

  const rowCounts = {};
  let totalRows = 0;
  for (const [schema, table] of tables) {
    const q = `SELECT count(*) FROM "${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;
    const n = Number(psqlScalar(psql, url, q));
    rowCounts[`${schema}.${table}`] = n;
    totalRows += n;
  }

  // Structural fingerprint: ordered schema.table.column:type list, hashed.
  const cols = psqlRows(
    psql,
    url,
    `SELECT n.nspname||'.'||c.relname||'.'||a.attname||':'||format_type(a.atttypid,a.atttypmod)
     FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND ${USER_SCHEMA_FILTER}
     ORDER BY 1`,
  ).map((r) => r[0]);
  const schemaSha256 = createHash("sha256").update(cols.join("\n")).digest("hex");

  // Non-PII read sample: the 5 largest tables by row count, reported as
  // name + row count + column count only. No cell values.
  const sample = Object.entries(rowCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, rows]) => ({
      table: name,
      rows,
      columns: cols.filter((c) => c.startsWith(`${name}.`)).length,
    }));

  return { counts, rowCounts, totalRows, schemaSha256, columnCount: cols.length, sample };
}

// --------------------------------------------------------------------------
// Object storage (S3-compatible; Cloudflare R2 requires forcePathStyle)
// --------------------------------------------------------------------------

function s3Config() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || process.env.AWS_REGION || "auto";

  const missing = [];
  if (!endpoint) missing.push("S3_ENDPOINT");
  if (!bucket) missing.push("S3_BUCKET");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (missing.length) {
    fail(`object storage not configured (${missing.join(", ")}) — refusing to run a backup that cannot be shipped off-box`);
  }

  // ENCRYPTION IN TRANSIT: the endpoint must be TLS. Non-negotiable.
  if (!/^https:\/\//i.test(endpoint)) {
    fail(`S3_ENDPOINT is not https — refusing to transmit a database dump in cleartext`);
  }

  return { endpoint, bucket, region, credentials: { accessKeyId, secretAccessKey } };
}

async function s3Client() {
  const cfg = s3Config();
  const { S3Client } = await import("@aws-sdk/client-s3");
  return {
    bucket: cfg.bucket,
    endpoint: cfg.endpoint,
    client: new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: true, // required by Cloudflare R2
      credentials: cfg.credentials,
    }),
  };
}

/**
 * Upload with encryption at rest. Tries SSE-S3 (AES256) first; if the provider
 * rejects the header we fall back and record that the bucket's own
 * provider-managed at-rest encryption applies (Cloudflare R2 encrypts all
 * objects at rest unconditionally).
 */
async function putObject(s3, key, body, contentType) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const base = { Bucket: s3.bucket, Key: key, Body: body, ContentType: contentType };
  try {
    await s3.client.send(new PutObjectCommand({ ...base, ServerSideEncryption: "AES256" }));
    return "SSE-S3:AES256";
  } catch (e) {
    const msg = String(e);
    if (/NotImplemented|InvalidArgument|UnsupportedArgument|encryption/i.test(msg)) {
      await s3.client.send(new PutObjectCommand(base));
      return "provider-managed-at-rest";
    }
    throw e;
  }
}

// --------------------------------------------------------------------------
// Retention policy — REPORTS, DOES NOT DELETE
// --------------------------------------------------------------------------

const RETENTION_DAYS = Number(process.env.ONX_RETENTION_DAYS || "90");
const RETENTION_ENFORCE = process.env.ONX_RETENTION_ENFORCE === "true";

async function retentionPass(s3, prefix) {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  let token;
  const expired = [];
  let total = 0;
  do {
    const page = await s3.client.send(
      new ListObjectsV2Command({ Bucket: s3.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) {
      total += 1;
      if ((o.LastModified?.getTime() ?? Date.now()) < cutoff && !o.Key?.includes("/_run-history/")) {
        expired.push(o.Key);
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  log(
    `retention: policy=${RETENTION_DAYS}d enforce=${RETENTION_ENFORCE} objects=${total} beyond-retention=${expired.length}`,
  );
  if (!RETENTION_ENFORCE) {
    log(
      `retention: DRY RUN — 0 objects deleted. Nothing existing is removed until the retention policy is proven. Candidates: ${expired.slice(0, 10).join(", ") || "(none)"}`,
    );
    return { deleted: 0, candidates: expired.length, enforced: false };
  }
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  for (const key of expired) {
    await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }));
    log(`retention: deleted ${key}`);
  }
  return { deleted: expired.length, candidates: expired.length, enforced: true };
}

// --------------------------------------------------------------------------
// Failure alerting
// --------------------------------------------------------------------------

async function alert(payload) {
  const url = process.env.ONX_ALERT_WEBHOOK;
  // Always emit a machine-greppable line: Render's own cron-failure
  // notification fires on the non-zero exit regardless of the webhook.
  console.error(`ONX_BACKUP_ALERT ${JSON.stringify(payload)}`);
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `ONX backup alert: ${JSON.stringify(payload)}` }),
    });
  } catch (e) {
    console.error(`[onx-pg-ops] alert webhook failed: ${String(e).slice(0, 200)}`);
  }
}

// --------------------------------------------------------------------------
// Target parsing
// --------------------------------------------------------------------------

/**
 * ONX_TARGETS = "label:dbId:URL_ENV_NAME[,label:dbId:URL_ENV_NAME...]"
 * The connection strings themselves live in separate env vars so that no
 * secret is ever embedded in a compound, log-prone variable.
 */
function parseTargets() {
  const raw = process.env.ONX_TARGETS;
  if (!raw) fail("ONX_TARGETS not set");
  const targets = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, dbId, urlEnv] = entry.split(":").map((s) => s.trim());
      if (!label || !dbId || !urlEnv) fail(`malformed ONX_TARGETS entry: ${entry}`);
      if (EXCLUDED_DB_IDS.has(dbId)) fail(`${dbId} is on the hard denylist and must never be touched`);
      const url = process.env[urlEnv];
      if (!url) fail(`connection string env ${urlEnv} is empty for ${label}/${dbId}`);
      return { label, dbId, url };
    });
  if (!targets.length) fail("ONX_TARGETS parsed to zero targets");
  return targets;
}

// --------------------------------------------------------------------------
// BACKUP
// --------------------------------------------------------------------------

async function runBackup() {
  const psql = anyPsql();
  const s3 = await s3Client();
  log(`op=backup run=${RUN_ID} started=${startedAt}`);
  log(`pg client majors installed: ${installedMajors().join(", ") || "(none)"}`);
  log(`object store: ${s3.endpoint} bucket=${s3.bucket} (values redacted)`);

  const results = [];
  for (const t of parseTargets()) {
    log(`--- target ${t.label} (${t.dbId}) ${maskConn(t.url)}`);
    const major = serverMajor(psql, t.url);
    const fullVersion = psqlScalar(psql, t.url, "SHOW server_version");
    log(`server version: ${fullVersion} (major ${major})`);

    const pgDump = binFor("pg_dump", major);
    if (!pgDump) {
      fail(`no pg_dump for major ${major} in this image (have: ${installedMajors().join(", ")})`);
    }
    const dumpVersion = execFileSync(pgDump, ["--version"], { encoding: "utf8" }).trim();
    log(`using ${pgDump} (${dumpVersion})`);

    // 1) REAL DUMP — custom format, read-only against production.
    const artifact = `${stamp}_${t.dbId}_pg${major}.dump`;
    const path = `/tmp/${artifact}`;
    const dumpStart = Date.now();
    execFileSync(
      pgDump,
      ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", "--verbose", "-f", path, t.url],
      { stdio: ["ignore", "inherit", "inherit"], timeout: 3_600_000, env: { ...process.env, PGCONNECT_TIMEOUT: "30" } },
    );
    const sizeBytes = statSync(path).size;
    const dumpSeconds = Math.round((Date.now() - dumpStart) / 1000);
    log(`dump complete: ${artifact} ${sizeBytes} bytes in ${dumpSeconds}s`);

    // 2) NON-EMPTY GATE
    if (sizeBytes < 1024) {
      fail(`artifact is ${sizeBytes} bytes — treating as a failed dump, refusing to upload`);
    }

    // 3) VERIFY IT IS A READABLE CUSTOM-FORMAT ARCHIVE (not just bytes on disk)
    const pgRestore = binFor("pg_restore", major);
    const toc = execFileSync(pgRestore, ["--list", path], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 600_000,
    });
    const tocEntries = toc.split("\n").filter((l) => l && !l.startsWith(";")).length;
    if (tocEntries < 1) fail(`pg_restore --list produced no TOC entries — artifact is not a valid archive`);
    log(`archive verified: ${tocEntries} TOC entries`);

    // 4) SHA-256
    const bytes = readFileSync(path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    log(`sha256: ${sha256}`);

    // 5) SOURCE FINGERPRINT (read-only catalogue queries)
    const fp = fingerprint(psql, t.url);
    log(`source integrity: ${JSON.stringify(fp.counts)} totalRows=${fp.totalRows} schemaSha256=${fp.schemaSha256}`);

    // 6) ORGANISED OBJECT PATH
    const day = stamp.slice(0, 8);
    const keyBase = `onx-pg-backups/${t.dbId}/${day.slice(0, 4)}/${day.slice(4, 6)}/${day.slice(6, 8)}/${artifact}`;
    const manifest = {
      schemaVersion: "onx-backup-manifest/1",
      iuId: "IU-P0-6",
      runId: RUN_ID,
      label: t.label,
      dbResourceId: t.dbId,
      pgServerVersion: fullVersion,
      pgMajor: major,
      pgDumpVersion: dumpVersion,
      dumpFormat: "custom",
      artifact,
      objectKey: keyBase,
      sizeBytes,
      sha256,
      tocEntries,
      dumpSeconds,
      startedAt,
      completedAt: nowIso(),
      integrity: fp,
      retentionPolicy: {
        days: RETENTION_DAYS,
        enforced: RETENTION_ENFORCE,
        note: "Deletes nothing until the policy is proven by a successful restore drill.",
      },
    };

    const sseArtifact = await putObject(s3, keyBase, bytes, "application/octet-stream");
    const sseManifest = await putObject(
      s3,
      `${keyBase}.manifest.json`,
      Buffer.from(JSON.stringify(manifest, null, 2)),
      "application/json",
    );
    await putObject(s3, `${keyBase}.sha256`, Buffer.from(`${sha256}  ${artifact}\n`), "text/plain");
    log(`uploaded ${keyBase} (at-rest: ${sseArtifact}; manifest: ${sseManifest})`);

    // 7) RUN HISTORY — append-only, never subject to retention deletion
    await putObject(
      s3,
      `onx-pg-backups/_run-history/${t.dbId}/${stamp}_${RUN_ID}.json`,
      Buffer.from(JSON.stringify({ ...manifest, outcome: "PASS" }, null, 2)),
      "application/json",
    );

    // 8) latest pointer (metadata only — never overwrites a dated artifact)
    await putObject(
      s3,
      `onx-pg-backups/${t.dbId}/latest.manifest.json`,
      Buffer.from(JSON.stringify(manifest, null, 2)),
      "application/json",
    );

    results.push(manifest);
    console.log(`ONX_BACKUP_RESULT ${JSON.stringify({
      dbResourceId: t.dbId,
      artifact,
      objectKey: keyBase,
      sizeBytes,
      sha256,
      pgMajor: major,
      pgServerVersion: fullVersion,
      tocEntries,
      counts: fp.counts,
      totalRows: fp.totalRows,
      schemaSha256: fp.schemaSha256,
      atRestEncryption: sseArtifact,
      inTransit: "TLS (https endpoint enforced)",
      runId: RUN_ID,
    })}`);
  }

  const retention = await retentionPass(s3, "onx-pg-backups/");
  console.log(`ONX_BACKUP_SUMMARY ${JSON.stringify({
    runId: RUN_ID,
    op: "backup",
    outcome: "PASS",
    targets: results.map((r) => ({ dbResourceId: r.dbResourceId, artifact: r.artifact, sha256: r.sha256, sizeBytes: r.sizeBytes })),
    retention,
    startedAt,
    completedAt: nowIso(),
  })}`);
  log("ONX_OP_DONE backup PASS");
}

// --------------------------------------------------------------------------
// RESTORE VERIFICATION (isolated, non-production)
// --------------------------------------------------------------------------

async function runRestoreVerify() {
  const targetUrl = process.env.ONX_RESTORE_TARGET_URL;
  if (!targetUrl) fail("ONX_RESTORE_TARGET_URL not set");
  const objectKey = process.env.ONX_RESTORE_OBJECT_KEY;
  if (!objectKey) fail("ONX_RESTORE_OBJECT_KEY not set");

  // ---- ISOLATION GUARD: never write into anything that looks like prod ----
  const targetHost = new URL(targetUrl).hostname;
  const deny = (process.env.ONX_PROD_HOST_DENY || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  for (const d of deny) {
    if (targetHost === d || targetHost.startsWith(`${d}.`)) {
      fail(`restore target host matches production denylist entry ${d} — refusing`);
    }
  }
  for (const excluded of EXCLUDED_DB_IDS) {
    if (targetHost.includes(excluded.replace(/-a$/, ""))) {
      fail(`restore target host resolves to the excluded database ${excluded} — refusing`);
    }
  }
  const expectIsolated = process.env.ONX_RESTORE_TARGET_DB_ID || "";
  log(`op=restore-verify run=${RUN_ID}`);
  log(`isolated target: ${maskConn(targetUrl)} (resource ${expectIsolated || "unknown"})`);
  log(`denylist checked against ${deny.length} production host(s): PASS`);

  const s3 = await s3Client();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");

  const readAll = async (key) => {
    const r = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }));
    const chunks = [];
    for await (const c of r.Body) chunks.push(c);
    return Buffer.concat(chunks);
  };

  const manifest = JSON.parse((await readAll(`${objectKey}.manifest.json`)).toString());
  log(`manifest: artifact=${manifest.artifact} sha256=${manifest.sha256} pgMajor=${manifest.pgMajor}`);

  const artifactBytes = await readAll(objectKey);
  const sha256 = createHash("sha256").update(artifactBytes).digest("hex");
  const checksumMatch = sha256 === manifest.sha256;
  log(`downloaded ${artifactBytes.length} bytes; sha256=${sha256}; manifest match=${checksumMatch}`);
  if (!checksumMatch) fail(`CHECKSUM MISMATCH: downloaded ${sha256} != manifest ${manifest.sha256}`);
  if (artifactBytes.length !== manifest.sizeBytes) {
    fail(`SIZE MISMATCH: downloaded ${artifactBytes.length} != manifest ${manifest.sizeBytes}`);
  }

  const path = `/tmp/${manifest.artifact}`;
  writeFileSync(path, artifactBytes);

  const psql = anyPsql();
  const targetMajor = serverMajor(psql, targetUrl);
  log(`restore target server major: ${targetMajor}; artifact major: ${manifest.pgMajor}`);
  if (targetMajor !== manifest.pgMajor) {
    fail(`major version mismatch: restore instance is ${targetMajor}, artifact is ${manifest.pgMajor}`);
  }

  const pgRestore = binFor("pg_restore", targetMajor);
  if (!pgRestore) fail(`no pg_restore for major ${targetMajor}`);

  const restoreStart = Date.now();
  try {
    execFileSync(
      pgRestore,
      ["--no-owner", "--no-privileges", "--exit-on-error", "--jobs=2", "-d", targetUrl, path],
      { stdio: ["ignore", "inherit", "inherit"], timeout: 3_600_000, env: { ...process.env, PGCONNECT_TIMEOUT: "30" } },
    );
  } catch (e) {
    // A clean target can still emit benign notices; re-run single-threaded and
    // report honestly rather than swallowing the failure.
    log(`parallel restore reported errors, retrying single-threaded for a precise report`);
    execFileSync(pgRestore, ["--no-owner", "--no-privileges", "-d", targetUrl, path], {
      stdio: ["ignore", "inherit", "inherit"],
      timeout: 3_600_000,
    });
  }
  const restoreSeconds = Math.round((Date.now() - restoreStart) / 1000);
  log(`pg_restore completed in ${restoreSeconds}s`);

  // ---- POST-RESTORE INTEGRITY ----
  const after = fingerprint(psql, targetUrl);
  const before = manifest.integrity;

  const countDiffs = {};
  let countsMatch = true;
  for (const k of Object.keys(before.counts)) {
    const b = before.counts[k];
    const a = after.counts[k];
    countDiffs[k] = { source: b, restored: a, match: b === a };
    if (b !== a) countsMatch = false;
  }

  const tableDiffs = [];
  const allTables = new Set([...Object.keys(before.rowCounts), ...Object.keys(after.rowCounts)]);
  for (const t of allTables) {
    const b = before.rowCounts[t] ?? null;
    const a = after.rowCounts[t] ?? null;
    if (b !== a) tableDiffs.push({ table: t, source: b, restored: a });
  }

  const schemaMatch = before.schemaSha256 === after.schemaSha256;
  const rowsMatch = before.totalRows === after.totalRows;
  const pass = countsMatch && schemaMatch && rowsMatch && tableDiffs.length === 0 && checksumMatch;

  log(`counts: ${JSON.stringify(countDiffs)}`);
  log(`schemaSha256 source=${before.schemaSha256} restored=${after.schemaSha256} match=${schemaMatch}`);
  log(`totalRows source=${before.totalRows} restored=${after.totalRows} match=${rowsMatch}`);
  log(`per-table mismatches: ${tableDiffs.length}${tableDiffs.length ? ` -> ${JSON.stringify(tableDiffs.slice(0, 20))}` : ""}`);
  log(`non-PII sample (restored, largest tables): ${JSON.stringify(after.sample)}`);

  const report = {
    schemaVersion: "onx-restore-report/1",
    iuId: "IU-P0-6",
    runId: RUN_ID,
    outcome: pass ? "PASS" : "FAIL",
    sourceDbResourceId: manifest.dbResourceId,
    restoreTargetDbResourceId: expectIsolated,
    restoreTargetIsolated: true,
    restoreTargetHostDenylistChecked: deny.length,
    artifact: manifest.artifact,
    objectKey,
    artifactSha256Manifest: manifest.sha256,
    artifactSha256Downloaded: sha256,
    checksumMatch,
    pgMajorSource: manifest.pgMajor,
    pgMajorRestoreTarget: targetMajor,
    restoreSeconds,
    counts: countDiffs,
    schemaSha256Source: before.schemaSha256,
    schemaSha256Restored: after.schemaSha256,
    schemaMatch,
    totalRowsSource: before.totalRows,
    totalRowsRestored: after.totalRows,
    perTableMismatches: tableDiffs,
    nonPiiSampleSource: before.sample,
    nonPiiSampleRestored: after.sample,
    startedAt,
    completedAt: nowIso(),
  };

  await putObject(
    s3,
    `onx-pg-backups/_restore-drills/${manifest.dbResourceId}/${stamp}_${RUN_ID}.json`,
    Buffer.from(JSON.stringify(report, null, 2)),
    "application/json",
  );
  console.log(`ONX_RESTORE_REPORT ${JSON.stringify(report)}`);

  if (!pass) fail("post-restore integrity comparison FAILED");
  log("ONX_OP_DONE restore-verify PASS");
}

// --------------------------------------------------------------------------

try {
  if (OP === "backup") await runBackup();
  else if (OP === "restore-verify") await runRestoreVerify();
  else fail(`unknown ONX_OP=${OP} (expected "backup" or "restore-verify")`);
} catch (e) {
  await alert({ runId: RUN_ID, op: OP, error: String(e?.message ?? e).slice(0, 400), at: nowIso() });
  console.error(`[onx-pg-ops] ONX_OP_DONE ${OP} FAIL`);
  process.exit(1);
}
