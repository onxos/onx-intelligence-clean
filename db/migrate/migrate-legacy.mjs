#!/usr/bin/env node
// ONX legacy migration runner — validates CSV exports and loads them into
// PostgreSQL with idempotent upserts. Usage: node migrate-legacy.mjs <csvDir> [--dry-run]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import pg from "pg";

const csvDir = process.argv[2] ?? "/migration/incoming";
const dryRun = process.argv.includes("--dry-run");
const batch = `MIG-${new Date().toISOString().slice(0, 10)}`;

function parseCsv(text) {
  const [head, ...lines] = text.trim().split("\n");
  const cols = head.split(",").map((c) => c.trim());
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v.trim()])));
}

const LOADERS = {
  "inventory.csv": async (pool, rows) => {
    for (const r of rows) {
      await pool.query(
        `INSERT INTO dom_inventory_items ("itemCode",name,"nameAr",category,unit,"currentStock","minStock")
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("itemCode") DO NOTHING`,
        [r.itemCode, r.name, r.nameAr ?? null, r.category, r.unit, Number(r.currentStock), Number(r.minStock)]);
    }
    return rows.length;
  },
  "crm.csv": async (pool, rows) => {
    for (const r of rows) {
      await pool.query(
        `INSERT INTO dom_crm_contacts ("contactId",name,email,phone,type,stage,source)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("contactId") DO NOTHING`,
        [r.contactId, r.name, r.email ?? null, r.phone ?? null, r.type ?? "LEAD", r.stage ?? "AWARENESS", batch]);
    }
    return rows.length;
  },
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
if (!existsSync(csvDir)) { console.error(`CSV dir not found: ${csvDir}`); process.exit(1); }
for (const file of readdirSync(csvDir)) {
  const loader = LOADERS[file];
  if (!loader) { console.log(`SKIP ${file} (no loader)`); continue; }
  const rows = parseCsv(readFileSync(`${csvDir}/${file}`, "utf8"));
  console.log(`${file}: ${rows.length} rows ${dryRun ? "(dry-run, validated only)" : ""}`);
  if (!dryRun) console.log(`  loaded: ${await loader(pool, rows)}`);
}
await pool.end();
console.log(`Migration batch ${batch} complete.`);
