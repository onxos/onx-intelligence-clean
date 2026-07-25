#!/usr/bin/env node
// ONX PostgreSQL backup — pg_dump → gzip → R2 (S3-compatible), fail-LOUD.
// Runs as the onx-pg-backup Render Cron Job. Uses the INTERNAL database URL
// (same private network as the DB — no external SSL/IP-allowlist issue).
//
// INCIDENT fix (2026-07-25): (1) the cron previously had ZERO env vars and
// failed daily with "DATABASE_URL missing"; env is now configured. (2) the
// prior upload used the S3 SDK without `forcePathStyle`, which R2 requires —
// so uploads failed SILENTLY (caught, logged, exit 0). This version sets
// forcePathStyle:true AND exits non-zero on any dump/upload failure so a
// broken backup can never again masquerade as success. Retention: 30 dumps.
import { execSync } from "node:child_process";
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPlain = `/tmp/onx-backup-${stamp}.sql`;
const outGz = `${outPlain}.gz`;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error("[backup] FATAL: DATABASE_URL missing"); process.exit(1); }

const bucket = process.env.S3_BUCKET;
const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
  console.error("[backup] FATAL: S3_BUCKET/S3_ENDPOINT/AWS creds required — refusing to run a backup that cannot ship off-box.");
  process.exit(1);
}

// 1) Dump (read-only) --------------------------------------------------------
console.log(`[backup] ${new Date().toISOString()} starting pg_dump ${stamp}`);
execSync(`pg_dump "${dbUrl}" --no-owner --no-privileges --clean --if-exists -f ${outPlain}`, { stdio: "inherit" });
const gz = gzipSync(readFileSync(outPlain));
writeFileSync(outGz, gz);
const sizeBytes = statSync(outGz).size;
console.log(`[backup] compressed: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);

// 2) Integrity gate ----------------------------------------------------------
if (sizeBytes < 10240) {
  console.error(`[backup] FATAL: dump is ${sizeBytes} bytes (< 10KB) — treating as failed dump, NOT uploading.`);
  process.exit(1);
}

// 3) Upload to R2 (fail-LOUD) -----------------------------------------------
const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "auto",
  endpoint,
  forcePathStyle: true, // REQUIRED for Cloudflare R2
  credentials: { accessKeyId, secretAccessKey },
});
const day = stamp.slice(0, 10);
const key = `platform/${day}/onx-platform-${stamp}.sql.gz`;
console.log(`[backup] uploading → ${endpoint}/${bucket}/${key}`);
try {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: gz }));
  // stable pointer for quick restore discovery
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "platform/latest.sql.gz", Body: gz }));
  console.log(`[backup] ✅ uploaded ${key} (${sizeBytes} bytes) + latest pointer`);
} catch (e) {
  console.error(`[backup] FATAL: upload failed — ${String(e).slice(0, 300)}`);
  process.exit(1); // fail-LOUD: never report success on a failed upload
}

// 4) Retention: keep newest 30 daily dumps ----------------------------------
try {
  const { ListObjectsV2Command, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "platform/" }));
  const dumps = (listed.Contents ?? [])
    .filter((o) => /platform\/\d{4}-\d{2}-\d{2}\/.+\.sql\.gz$/.test(o.Key ?? ""))
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
  const stale = dumps.slice(30);
  for (const o of stale) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key }));
    console.log(`[backup] retention: removed ${o.Key}`);
  }
} catch (e) {
  console.warn(`[backup] retention pass skipped (non-fatal): ${String(e).slice(0, 150)}`);
}

console.log(`[backup] done.`);
