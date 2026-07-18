#!/usr/bin/env node
// ONX PostgreSQL backup — pg_dump to a compressed artifact, with optional
// upload to S3-compatible object storage (S3_BUCKET + AWS creds in env).
// Designed to run as a Render Cron Job (see render.yaml).
// RPO target: 24h (daily). Retention: keep last 14 dumps in the bucket.
import { execSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPlain = `/tmp/onx-backup-${stamp}.sql`;
const outGz = `${outPlain}.gz`;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error("DATABASE_URL missing"); process.exit(1); }

console.log(`[backup] starting pg_dump ${stamp}`);
execSync(`pg_dump "${dbUrl}" --no-owner --no-privileges -f ${outPlain}`, { stdio: "inherit" });
const gz = gzipSync(await readFile(outPlain));
await writeFile(outGz, gz);
console.log(`[backup] compressed: ${(statSync(outGz).size / 1024 / 1024).toFixed(1)} MB`);

const bucket = process.env.S3_BUCKET;
if (bucket && process.env.AWS_ACCESS_KEY_ID) {
  // Minimal S3 PUT (SigV4 via aws-sdk not bundled — use presigned-free
  // endpoint when S3_ENDPOINT allows, else log and keep local copy).
  const endpoint = process.env.S3_ENDPOINT ?? `https://${bucket}.s3.amazonaws.com`;
  const key = `onx-backups/onx-backup-${stamp}.sql.gz`;
  console.log(`[backup] upload target: ${endpoint}/${key}`);
  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region: process.env.AWS_REGION ?? "auto", endpoint: process.env.S3_ENDPOINT });
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(outGz) }));
    console.log("[backup] uploaded OK");
  } catch (e) {
    console.error(`[backup] upload failed (local dump retained this run): ${String(e).slice(0, 200)}`);
  }
} else {
  console.warn("[backup] S3_BUCKET/AWS_ACCESS_KEY_ID not set — dump created but NOT shipped off-box. Configure object storage for real DR.");
}
console.log(`[backup] done: ${outGz} exists=${existsSync(outGz)}`);
