#!/usr/bin/env node
// ============================================================================
// ONX blueprint guard (ONX-FRR-2026-001)
// ============================================================================
// render.yaml is only allowed to declare Render resources that exist in
// deploy-registry.json — the repo-local slice of the canonical routing
// registry (onxos/onx : onx-routing.json), whose names are the LIVE ratified
// names from the ONX-MRE-01 Render inventory. This is what makes
// blueprint↔production drift a CI failure instead of a quarterly audit
// finding: a blueprint apply that would spawn a duplicate service (old name
// matching nothing live) can no longer merge silently.
//
// Checks
//   R1  every blueprint web/worker/cron service is registered
//   R2  every registered service appears in the blueprint
//   R3  every fromService / fromDatabase reference resolves inside the
//       blueprint (no phantom infra wiring)
//   R4  every declared key-value store exists in the ratified live inventory
//   R5  declared regions are mutually consistent, and equal ratifiedRegion
//       when the registry pins one; a resource with NO region is flagged,
//       because Render then silently defaults the region — which is exactly
//       how a split-region stack happens
//
// A violation passes ONLY when registered by name in knownDeviations
// (nothing exists anonymously). Zero dependencies; node >= 18.
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const failures = [];
const notes = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);
const note = (msg) => notes.push(`  ${msg}`);

// ------------------------------------------------------------------ registry
const registryPath = path.join(ROOT, "deploy-registry.json");
let registry = null;
if (!existsSync(registryPath)) {
  fail("REGISTRY", "deploy-registry.json is missing at the repository root.");
} else {
  try {
    registry = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch (e) {
    fail("REGISTRY", `deploy-registry.json is not valid JSON: ${e.message}`);
  }
}

// ----------------------------------------------------------------- blueprint
const blueprintPath = path.join(ROOT, "render.yaml");
if (!existsSync(blueprintPath)) {
  fail("BLUEPRINT", "render.yaml is missing at the repository root.");
}

if (registry && existsSync(blueprintPath)) {
  const text = readFileSync(blueprintPath, "utf8");
  const deviations = registry.knownDeviations ?? [];
  const excused = (subject) => deviations.find((d) => d.subject === subject);
  const failUnlessExcused = (check, subject, msg) => {
    const d = excused(subject);
    if (d) note(`DEVIATION ${d.id} covers ${subject}`);
    else fail(check, msg);
  };

  // Minimal structural parse of the top-level lists. List items begin
  // "  - <key>:"; nested env entries begin "      - key:".
  const sections = { databases: [], services: [] };
  let section = null;
  let item = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    const top = line.match(/^(databases|services):\s*$/);
    if (top) {
      section = top[1];
      item = null;
      continue;
    }
    if (/^\S/.test(line)) {
      section = null;
      item = null;
      continue;
    }
    if (!section) continue;
    const start = line.match(/^  - (\w+):\s*(.*)$/);
    if (start) {
      item = { [start[1]]: start[2].replace(/^["']|["']$/g, ""), envKeys: [], refs: [] };
      sections[section].push(item);
      continue;
    }
    if (!item) continue;
    const envStart = line.match(/^\s{4,}- key:\s*(.+)$/);
    if (envStart) {
      item.envKeys.push({ key: envStart[1].replace(/^["']|["']$/g, "") });
      continue;
    }
    const kv = line.match(/^\s+(\w+):\s*(.+)$/);
    if (!kv) continue;
    const [, key, valRaw] = kv;
    const val = valRaw.replace(/^["']|["']$/g, "");
    if (key === "value" && item.envKeys.length) item.envKeys.at(-1).value = val;
    else if (key === "name" && /^\s{10,}/.test(line)) item.refs.push(val);
    else if (!(key in item)) item[key] = val;
  }

  const services = sections.services;
  const databases = sections.databases;
  const regServices = new Set((registry.services ?? []).map((s) => s.name));
  const regDatabases = new Set((registry.databases ?? []).map((d) => d.name));
  const liveKv = new Set((registry.liveKeyValueStores ?? []).map((k) => k.name.trim()));

  // R1 — no anonymous deployments.
  for (const svc of services) {
    if (svc.type === "redis") continue; // R4 owns stores
    if (!regServices.has(svc.name)) {
      failUnlessExcused(
        "R1",
        svc.name,
        `render.yaml declares service ${svc.name}, which deploy-registry.json does not register (anonymous deployment).`,
      );
    }
  }
  for (const db of databases) {
    if (!regDatabases.has(db.name)) {
      failUnlessExcused(
        "R1",
        db.name,
        `render.yaml declares database ${db.name}, which deploy-registry.json does not register.`,
      );
    }
  }

  // R2 — every registered service is actually declared.
  for (const s of registry.services ?? []) {
    if (s.expectInBlueprint === false) continue;
    if (!services.some((svc) => svc.name === s.name)) {
      failUnlessExcused(
        "R2",
        s.name,
        `registered service ${s.name} (${s.systemId ?? "?"}) is missing from render.yaml.`,
      );
    }
  }

  // R3 — internal references resolve.
  const declared = new Set([...services.map((s) => s.name), ...databases.map((d) => d.name)]);
  for (const svc of services) {
    for (const ref of svc.refs) {
      if (!declared.has(ref)) {
        fail(
          "R3",
          `${svc.name} references ${ref} via fromService/fromDatabase, but the blueprint declares no such resource.`,
        );
      }
    }
  }

  // R4 — declared key-value stores must exist live.
  for (const svc of services) {
    if (svc.type !== "redis") continue;
    if (!liveKv.has(svc.name)) {
      failUnlessExcused(
        "R4",
        svc.name,
        `render.yaml declares key-value store ${svc.name}, but the ratified live inventory has no such store (phantom infra).`,
      );
    }
  }

  // R5 — region discipline.
  const resources = [...services, ...databases];
  const regions = new Set(resources.map((r) => r.region).filter(Boolean));
  if (regions.size > 1) {
    fail("R5", `blueprint mixes regions (${[...regions].join(", ")}); one stack, one region.`);
  }
  if (registry.ratifiedRegion) {
    for (const r of resources) {
      if (r.region && r.region !== registry.ratifiedRegion) {
        fail("R5", `${r.name} declares region ${r.region}; the registry ratified ${registry.ratifiedRegion}.`);
      }
    }
  }
  const regionless = resources.filter((r) => !r.region).map((r) => r.name);
  if (regionless.length) {
    note(
      `R5 WARNING: no region declared for ${regionless.join(", ")} — Render will pick a default silently (this is how a split-region stack happens). Declare the region explicitly once the live region is ratified.`,
    );
  }

  note(`blueprint: ${services.length} services + ${databases.length} databases checked`);
}

// ------------------------------------------------------------------- report
console.log("ONX blueprint guard");
console.log("=".repeat(60));
if (notes.length) console.log(notes.join("\n"));
if (failures.length) {
  console.error("\nFAILED — blueprint/registry violations:\n");
  for (const f of failures) console.error(`  ${f}\n`);
  console.error(`${failures.length} violation(s).`);
  process.exit(1);
}
console.log("\nPASS — blueprint agrees with the deploy registry.");
