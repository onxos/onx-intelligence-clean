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
 *   self-check              no DB/S3 access; emit runtime source provenance
 *   backup          (default) pg_dump --format=custom -> sha256 -> object store
 *   restore-verify            pull artifact -> pg_restore into an ISOLATED
 *                             non-production instance -> compare integrity
 *   retrieve-evidence         independently retrieve and validate one durable
 *                             restore-drill record before teardown
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
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { createInterface } from "node:readline";

// --------------------------------------------------------------------------
// Constants and guards
// --------------------------------------------------------------------------

/** Never dump, never restore into, never touch. Hard denylist. */
const EXCLUDED_DB_IDS = new Set([
  "dpg-d86s3uog4nts73b9j4sg-a", // intelligence — explicitly out of scope
]);

const OP = (process.env.ONX_OP || "backup").trim();
const CONTRACT_VERSION = "iu-p0-6/2";
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

function snapshotSql(snapshotId, sql) {
  if (!snapshotId) return sql;
  if (!/^[0-9A-Fa-f-]+$/.test(snapshotId)) {
    fail("exported snapshot id has an unexpected format");
  }
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT '${snapshotId}';
${sql};
COMMIT;`;
}

function psqlScalar(psql, url, sql, snapshotId = null) {
  const out = execFileSync(
    psql,
    ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", snapshotSql(snapshotId, sql), url],
    {
    encoding: "utf8",
    timeout: 300_000,
    env: { ...process.env, PGCONNECT_TIMEOUT: "20" },
    },
  );
  const values = out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(BEGIN|SET|COMMIT|ROLLBACK)$/.test(line));
  return values.at(-1) ?? "";
}

function psqlRows(psql, url, sql, snapshotId = null) {
  const out = execFileSync(
    psql,
    ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-F", "\t", "-c", snapshotSql(snapshotId, sql), url],
    {
      encoding: "utf8",
      timeout: 600_000,
      env: { ...process.env, PGCONNECT_TIMEOUT: "20" },
    },
  );
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(BEGIN|SET|COMMIT|ROLLBACK)$/.test(line))
    .map((line) => line.split("\t"));
}

function serverMajor(psql, url, snapshotId = null) {
  const num = Number(psqlScalar(psql, url, "SHOW server_version_num", snapshotId));
  if (!Number.isFinite(num)) fail("could not read server_version_num");
  return Math.floor(num / 10000);
}

/**
 * Keep a read-only REPEATABLE READ transaction open while pg_dump and every
 * integrity query use the exact same exported snapshot. Without this, a live
 * write between pg_dump and fingerprint() can make a valid backup fail its
 * restore drill or, worse, attach a row-count manifest that was never in the
 * dump.
 */
async function withExportedSnapshot(psql, url, work) {
  const child = spawn(psql, ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", url], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PGCONNECT_TIMEOUT: "20" },
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4_000);
  });
  const exitPromise = once(child, "exit");
  const lines = createInterface({ input: child.stdout });
  const snapshotPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out exporting PostgreSQL snapshot")), 60_000);
    const onError = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once("error", onError);
    child.once("exit", (code) => {
      if (code !== 0) onError(new Error(`snapshot exporter exited ${code}: ${stderr.slice(0, 500)}`));
    });
    lines.on("line", (raw) => {
      const line = raw.trim();
      if (!line.startsWith("ONX_SNAPSHOT:")) return;
      const snapshotId = line.slice("ONX_SNAPSHOT:".length);
      clearTimeout(timer);
      child.off("error", onError);
      resolve(snapshotId);
    });
  });

  child.stdin.write("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n");
  child.stdin.write("SELECT 'ONX_SNAPSHOT:' || pg_export_snapshot();\n");
  const snapshotId = await snapshotPromise;
  log(`exported one read-only snapshot for dump + integrity proof`);

  try {
    return await work(snapshotId);
  } finally {
    if (child.exitCode === null) {
      child.stdin.end("ROLLBACK;\n\\q\n");
      await Promise.race([
        exitPromise,
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);
      if (child.exitCode === null) child.kill("SIGTERM");
    }
    lines.close();
  }
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
function fingerprint(psql, url, snapshotId = null) {
  const counts = {};
  for (const [k, sql] of Object.entries(COUNT_QUERIES)) {
    counts[k] = Number(psqlScalar(psql, url, sql, snapshotId));
  }

  const tables = psqlRows(
    psql,
    url,
    `SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='r' AND ${USER_SCHEMA_FILTER} ORDER BY 1,2`,
    snapshotId,
  );

  const rowCounts = {};
  let totalRows = 0;
  for (const [schema, table] of tables) {
    const q = `SELECT count(*) FROM "${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;
    const n = Number(psqlScalar(psql, url, q, snapshotId));
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
    snapshotId,
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
      const durableEvidence =
        o.Key?.includes("/_run-history/") || o.Key?.includes("/_restore-drills/");
      if ((o.LastModified?.getTime() ?? Date.now()) < cutoff && !durableEvidence) {
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
    const snap = await withExportedSnapshot(psql, t.url, async (snapshotId) => {
      const major = serverMajor(psql, t.url, snapshotId);
      const fullVersion = psqlScalar(psql, t.url, "SHOW server_version", snapshotId);
      log(`server version: ${fullVersion} (major ${major})`);

      const pgDump = binFor("pg_dump", major);
      if (!pgDump) {
        fail(`no pg_dump for major ${major} in this image (have: ${installedMajors().join(", ")})`);
      }
      const dumpVersion = execFileSync(pgDump, ["--version"], { encoding: "utf8" }).trim();
      log(`using ${pgDump} (${dumpVersion})`);

      // 1) REAL DUMP — custom format, from the exported read-only snapshot.
      const artifact = `${stamp}_${t.dbId}_pg${major}.dump`;
      const path = `/tmp/${artifact}`;
      const dumpStart = Date.now();
      execFileSync(
        pgDump,
        [
          "--format=custom", "--compress=6", "--no-owner", "--no-privileges",
          "--verbose", `--snapshot=${snapshotId}`, "-f", path, t.url,
        ],
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

      // 5) SOURCE FINGERPRINT — exact same snapshot as pg_dump.
      const fp = fingerprint(psql, t.url, snapshotId);
      log(`source integrity: ${JSON.stringify(fp.counts)} totalRows=${fp.totalRows} schemaSha256=${fp.schemaSha256}`);
      return {
        major, fullVersion, pgDump, dumpVersion, artifact, path, sizeBytes,
        dumpSeconds, pgRestore, tocEntries, bytes, sha256, fp,
      };
    });
    const {
      major, fullVersion, dumpVersion, artifact, sizeBytes, dumpSeconds,
      tocEntries, bytes, sha256, fp,
    } = snap;

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

/**
 * Read-only inventory of what is actually in object storage. This is the
 * independent proof that a backup run produced a real artifact: it does not
 * rely on having captured the run's stdout.
 */
async function runInventory() {
  const s3 = await s3Client();
  const { ListObjectsV2Command, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const prefix = process.env.ONX_INVENTORY_PREFIX || "onx-pg-backups/";
  let token;
  const objects = [];
  do {
    const page = await s3.client.send(
      new ListObjectsV2Command({ Bucket: s3.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) {
      objects.push({ key: o.Key, size: o.Size, lastModified: o.LastModified?.toISOString() });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  objects.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1));
  log(`inventory of ${s3.bucket}/${prefix}: ${objects.length} objects`);
  for (const o of objects) log(`  ${o.lastModified}  ${String(o.size).padStart(12)}  ${o.key}`);

  // Echo every manifest so the sha256 + counts are visible without the run log.
  for (const o of objects.filter((x) => x.key.endsWith(".manifest.json"))) {
    const r = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: o.key }));
    const chunks = [];
    for await (const c of r.Body) chunks.push(c);
    console.log(`ONX_MANIFEST ${o.key} ${chunks.join("").toString()}`);
  }
  console.log(`ONX_INVENTORY ${JSON.stringify({ bucket: s3.bucket, prefix, count: objects.length, objects })}`);
  log("ONX_OP_DONE inventory PASS");
}

async function runRestoreVerify() {
  const targetUrl = process.env.ONX_RESTORE_TARGET_URL;
  if (!targetUrl) fail("ONX_RESTORE_TARGET_URL not set");
  const expectIsolated = process.env.ONX_RESTORE_TARGET_DB_ID || "";
  const isolatedName = process.env.ONX_RESTORE_TARGET_NAME || "";
  const isolatedDatabaseName = process.env.ONX_RESTORE_TARGET_DATABASE_NAME || "";
  if (!expectIsolated) fail("ONX_RESTORE_TARGET_DB_ID not set");
  if (!isolatedName.startsWith("onx-restore-test-")) {
    fail(`restore target name ${isolatedName || "<empty>"} is not an onx-restore-test instance`);
  }
  if (isolatedDatabaseName !== "onx_restore_test") {
    fail(`restore target database name ${isolatedDatabaseName || "<empty>"} is not onx_restore_test`);
  }
  let objectKey = process.env.ONX_RESTORE_OBJECT_KEY;
  if (!objectKey) fail("ONX_RESTORE_OBJECT_KEY not set");

  // "latest" resolves through the stable pointer written by the backup, so a
  // restore never depends on having scraped an object key out of a run log.
  if (objectKey === "latest") {
    const srcDb = process.env.ONX_RESTORE_SOURCE_DB_ID;
    if (!srcDb) fail('ONX_RESTORE_OBJECT_KEY="latest" requires ONX_RESTORE_SOURCE_DB_ID');
    const s3l = await s3Client();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const r = await s3l.client.send(
      new GetObjectCommand({ Bucket: s3l.bucket, Key: `onx-pg-backups/${srcDb}/latest.manifest.json` }),
    );
    const chunks = [];
    for await (const c of r.Body) chunks.push(c);
    const latest = JSON.parse(Buffer.concat(chunks).toString());
    objectKey = latest.objectKey;
    log(`resolved "latest" for ${srcDb} -> ${objectKey} (sha256 ${latest.sha256})`);
  }

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
  log(`op=restore-verify run=${RUN_ID}`);
  log(`isolated target: ${maskConn(targetUrl)} (resource ${expectIsolated}; name ${isolatedName})`);
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

  // A prefixed resource name alone is not proof of an empty isolated target.
  // Refuse to restore over any pre-existing application object or data.
  const empty = fingerprint(psql, targetUrl);
  if (
    empty.counts.tables !== 0 ||
    empty.counts.views !== 0 ||
    empty.counts.sequences !== 0 ||
    empty.totalRows !== 0
  ) {
    fail(
      `isolated restore target is not empty: tables=${empty.counts.tables} views=${empty.counts.views} ` +
      `sequences=${empty.counts.sequences} rows=${empty.totalRows}`,
    );
  }
  log(`isolated target emptiness proof: PASS`);

  const restoreStart = Date.now();
  execFileSync(
    pgRestore,
    ["--no-owner", "--no-privileges", "--exit-on-error", "--jobs=2", "-d", targetUrl, path],
    { stdio: ["ignore", "inherit", "inherit"], timeout: 3_600_000, env: { ...process.env, PGCONNECT_TIMEOUT: "30" } },
  );
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
    restoreTargetName: isolatedName,
    restoreTargetDatabaseName: isolatedDatabaseName,
    restoreTargetEmptyBeforeRestore: true,
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
// DURABLE RESTORE-EVIDENCE RETRIEVAL
// --------------------------------------------------------------------------

async function runRetrieveRestoreEvidence() {
  const evidenceKey = process.env.ONX_RESTORE_EVIDENCE_KEY || "";
  const expectedTarget = process.env.ONX_RESTORE_EXPECT_TARGET_DB_ID || "";
  const expectedSource = process.env.ONX_RESTORE_EXPECT_SOURCE_DB_ID || "";
  const productionDbIds = new Set(
    (process.env.ONX_RESTORE_PROD_DB_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const keyMatch = evidenceKey.match(
    /^onx-pg-backups\/_restore-drills\/(dpg-[a-z0-9-]+)\/([0-9]{8}T[0-9]{6}Z)_[A-Za-z0-9._-]+\.json$/,
  );
  if (!keyMatch) fail("restore evidence key is not a canonical _restore-drills JSON object");
  if (!/^dpg-[a-z0-9-]+$/.test(expectedTarget)) {
    fail("ONX_RESTORE_EXPECT_TARGET_DB_ID is missing or malformed");
  }
  if (!/^dpg-[a-z0-9-]+$/.test(expectedSource)) {
    fail("ONX_RESTORE_EXPECT_SOURCE_DB_ID is missing or malformed");
  }
  if (productionDbIds.size < 3) {
    fail("ONX_RESTORE_PROD_DB_IDS is incomplete; refusing evidence acceptance");
  }
  if (productionDbIds.has(expectedTarget) || EXCLUDED_DB_IDS.has(expectedTarget)) {
    fail("restore evidence target is a production database");
  }
  if (!productionDbIds.has(expectedSource) || EXCLUDED_DB_IDS.has(expectedSource)) {
    fail("restore evidence source is not an approved backup database");
  }
  if (keyMatch[1] !== expectedSource) {
    fail(`restore evidence path source ${keyMatch[1]} != expected source ${expectedSource}`);
  }

  const s3 = await s3Client();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  let response;
  try {
    response = await s3.client.send(
      new GetObjectCommand({ Bucket: s3.bucket, Key: evidenceKey }),
    );
  } catch (error) {
    fail(`restore evidence object could not be retrieved: ${error?.name || "S3_ERROR"}`);
  }
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const evidenceSha256 = createHash("sha256").update(bytes).digest("hex");
  let report;
  try {
    report = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("restore evidence object is not valid JSON");
  }

  const countEntries = Object.values(report.counts || {});
  const countsMatch =
    countEntries.length > 0 &&
    countEntries.every(
      (entry) => entry && entry.match === true && entry.source === entry.restored,
    );
  const valid =
    report.schemaVersion === "onx-restore-report/1" &&
    report.iuId === "IU-P0-6" &&
    report.outcome === "PASS" &&
    report.sourceDbResourceId === expectedSource &&
    report.restoreTargetDbResourceId === expectedTarget &&
    report.restoreTargetIsolated === true &&
    report.restoreTargetEmptyBeforeRestore === true &&
    String(report.restoreTargetName || "").startsWith("onx-restore-test-") &&
    report.restoreTargetDatabaseName === "onx_restore_test" &&
    report.checksumMatch === true &&
    report.schemaMatch === true &&
    report.totalRowsSource === report.totalRowsRestored &&
    countsMatch &&
    Array.isArray(report.perTableMismatches) &&
    report.perTableMismatches.length === 0;
  if (!valid) {
    fail("restore evidence object failed the IU-P0-6 acceptance contract");
  }

  console.log(`ONX_RESTORE_EVIDENCE ${JSON.stringify({
    schemaVersion: "onx-restore-evidence-retrieval/1",
    iuId: "IU-P0-6",
    outcome: "PASS",
    evidenceKey,
    evidenceSha256,
    evidenceSizeBytes: bytes.length,
    sourceDbResourceId: report.sourceDbResourceId,
    restoreTargetDbResourceId: report.restoreTargetDbResourceId,
    restoreRunId: report.runId,
    checksumMatch: report.checksumMatch,
    schemaMatch: report.schemaMatch,
    totalRowsMatch: report.totalRowsSource === report.totalRowsRestored,
    perTableMismatchCount: report.perTableMismatches.length,
    retrievedAt: nowIso(),
  })}`);
  log("ONX_OP_DONE retrieve-evidence PASS");
}

// --------------------------------------------------------------------------

try {
  if (OP === "self-check") {
    const ownSourceSha256 = createHash("sha256")
      .update(readFileSync(new URL(import.meta.url)))
      .digest("hex");
    console.log(`ONX_SELF_CHECK ${JSON.stringify({
      contractVersion: CONTRACT_VERSION,
      ownSourceSha256,
      renderGitCommit: process.env.RENDER_GIT_COMMIT || null,
      runId: RUN_ID,
    })}`);
    log("ONX_OP_DONE self-check PASS");
  }
  else if (OP === "backup") await runBackup();
  else if (OP === "restore-verify") await runRestoreVerify();
  else if (OP === "retrieve-evidence") await runRetrieveRestoreEvidence();
  else if (OP === "inventory") await runInventory();
  else fail(`unknown ONX_OP=${OP} (expected "self-check", "backup", "restore-verify", "retrieve-evidence" or "inventory")`);
} catch (e) {
  await alert({ runId: RUN_ID, op: OP, error: String(e?.message ?? e).slice(0, 400), at: nowIso() });
  console.error(`[onx-pg-ops] ONX_OP_DONE ${OP} FAIL`);
  process.exit(1);
}
